"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser, getActiveWorkspace } from "@/lib/auth/workspace";
import { STORAGE_BUCKET } from "@/lib/env";
import { resolveUploadMime, maxReferenceBytes } from "@/lib/upload-constants";
import { parseFileName } from "@/lib/files";

/**
 * Source files are stored as REFERENCES only — just the filename / size / type
 * are recorded (storage_path = null). We never upload the bytes to Supabase
 * Storage, because the app only needs the name for reference. This sidesteps
 * the Vercel body limit and the Supabase per-file size cap entirely.
 */

export interface RegisterInput {
  originalFileName: string;
  mime: string;
  sizeBytes: number;
}

export interface RegisterResult {
  ok: boolean;
  fileId?: string;
  error?: string;
  skippedDuplicate?: boolean;
  displayName?: string;
}

/** Register a source file by name (metadata only, no bytes stored). */
export async function registerSourceFile(
  input: RegisterInput
): Promise<RegisterResult> {
  const { user } = await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace หรือไม่มีสิทธิ์" };

  const { originalFileName, displayName, extension } = parseFileName(
    input.originalFileName
  );
  const mime = resolveUploadMime(input.mime, originalFileName);
  if (!mime) {
    return { ok: false, error: "ชนิดไฟล์ไม่รองรับ (PDF, PNG, JPEG, JSON, MD)" };
  }
  if (input.sizeBytes < 0 || input.sizeBytes > maxReferenceBytes()) {
    return { ok: false, error: "ขนาดไฟล์ไม่ถูกต้อง" };
  }

  const supabase = await createServerSupabase();

  // Dedup by (workspace, original filename, size) — no bytes to hash.
  const { data: existing } = await supabase
    .from("source_files")
    .select("id, display_name")
    .eq("workspace_id", workspace.id)
    .eq("original_file_name", originalFileName)
    .eq("size_bytes", input.sizeBytes)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      skippedDuplicate: true,
      fileId: (existing as { id: string }).id,
      displayName:
        (existing as { display_name: string | null }).display_name ?? displayName,
    };
  }

  const { data: inserted, error } = await supabase
    .from("source_files")
    .insert({
      workspace_id: workspace.id,
      external_id: null,
      title: displayName,
      display_name: displayName,
      original_file_name: originalFileName,
      extension: extension || null,
      file_type: mime,
      mime_type: mime,
      checksum: null,
      // storage_bucket is NOT NULL (has a default); keep the default. It is
      // unused for reference rows because storage_path is null.
      storage_bucket: STORAGE_BUCKET,
      storage_path: null, // reference only — no file stored
      size_bytes: input.sizeBytes,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/imports");
  revalidatePath("/assessments");
  return { ok: true, fileId: (inserted as { id: string }).id, displayName };
}

/**
 * Signed URL for reading a source file that actually has stored bytes (legacy
 * uploaded files). Reference-only files (storage_path = null) have nothing to
 * open and return an error.
 */
export async function getSignedUrl(
  sourceFileId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { data: file } = await supabase
    .from("source_files")
    .select("storage_path, storage_bucket, workspace_id")
    .eq("id", sourceFileId)
    .maybeSingle();
  const row = file as
    | { storage_path: string | null; storage_bucket: string | null; workspace_id: string }
    | null;
  if (!row || row.workspace_id !== workspace.id) {
    return { ok: false, error: "ไม่พบไฟล์หรือไม่มีสิทธิ์เข้าถึง" };
  }
  if (!row.storage_path) {
    return { ok: false, error: "รายการนี้เก็บไว้เป็นชื่ออ้างอิงเท่านั้น (ไม่มีไฟล์)" };
  }

  const { data, error } = await supabase.storage
    .from(row.storage_bucket ?? STORAGE_BUCKET)
    .createSignedUrl(row.storage_path, 60 * 10);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "สร้างลิงก์ไม่สำเร็จ" };
  }
  return { ok: true, url: data.signedUrl };
}

/** Delete a source file: remove any storage object AND the DB row. */
export async function deleteSourceFile(
  sourceFileId: string
): Promise<{ ok: boolean; error?: string }> {
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { data: file } = await supabase
    .from("source_files")
    .select("storage_path, storage_bucket, workspace_id")
    .eq("id", sourceFileId)
    .maybeSingle();
  const row = file as
    | { storage_path: string | null; storage_bucket: string | null; workspace_id: string }
    | null;
  if (!row || row.workspace_id !== workspace.id) {
    return { ok: false, error: "ไม่พบไฟล์หรือไม่มีสิทธิ์เข้าถึง" };
  }

  if (row.storage_path) {
    await supabase.storage
      .from(row.storage_bucket ?? STORAGE_BUCKET)
      .remove([row.storage_path]);
  }
  const { error } = await supabase
    .from("source_files")
    .delete()
    .eq("id", sourceFileId)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/imports");
  revalidatePath("/assessments");
  return { ok: true };
}
