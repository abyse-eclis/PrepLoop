"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser, getActiveWorkspace } from "@/lib/auth/workspace";
import { ALLOWED_UPLOAD_MIME, STORAGE_BUCKET, getMaxUploadBytes } from "@/lib/env";
import { ALLOWED_EXT_BY_MIME } from "@/lib/upload-constants";
import { parseFileName, buildStorageKey } from "@/lib/files";

/**
 * Uploads go DIRECTLY from the browser to Supabase Storage using a signed
 * upload URL, so the file never passes through the Next.js server action
 * (Vercel caps request bodies at ~4.5MB). The server only:
 *   1) authorizes + validates and mints a signed upload URL for a path it
 *      controls (scoped to the caller's workspace), then
 *   2) records the source_files metadata row after the client upload finishes.
 * Size is bounded by MAX_UPLOAD_SIZE_MB and the Supabase bucket limit.
 */

export interface PrepareInput {
  originalFileName: string;
  mime: string;
  sizeBytes: number;
  checksum: string; // SHA-256 hex, computed in the browser
}

export interface PrepareResult {
  ok: boolean;
  mode?: "ready" | "duplicate";
  error?: string;
  path?: string;
  token?: string;
  displayName?: string;
  extension?: string;
  existingFileId?: string;
}

export interface FinalizeInput {
  path: string;
  originalFileName: string;
  displayName: string;
  extension: string;
  mime: string;
  sizeBytes: number;
  checksum: string;
}

export interface FinalizeResult {
  ok: boolean;
  fileId?: string;
  error?: string;
  skippedDuplicate?: boolean;
}

function validateFileMeta(
  mime: string,
  fileName: string,
  sizeBytes: number
): string | null {
  if (!ALLOWED_UPLOAD_MIME.includes(mime as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    return `ชนิดไฟล์ไม่รองรับ (${mime || "unknown"}) — รองรับ PDF, PNG, JPEG, JSON`;
  }
  const { extension } = parseFileName(fileName);
  if (extension && !ALLOWED_EXT_BY_MIME[mime]?.includes(extension)) {
    return `นามสกุลไฟล์ (.${extension}) ไม่ตรงกับชนิดไฟล์จริง (${mime})`;
  }
  const max = getMaxUploadBytes();
  if (sizeBytes > max) {
    return `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.round(max / 1024 / 1024)}MB)`;
  }
  if (sizeBytes <= 0) return "ไฟล์ว่างเปล่า";
  return null;
}

/** Step 1: authorize + validate, dedup by checksum, mint a signed upload URL. */
export async function prepareUpload(input: PrepareInput): Promise<PrepareResult> {
  await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace หรือไม่มีสิทธิ์" };

  const { originalFileName, displayName, extension } = parseFileName(
    input.originalFileName
  );
  const err = validateFileMeta(input.mime, originalFileName, input.sizeBytes);
  if (err) return { ok: false, error: err };

  const supabase = await createServerSupabase();

  // Content dedup: identical bytes already stored for this workspace -> skip.
  const { data: existing } = await supabase
    .from("source_files")
    .select("id, display_name")
    .eq("workspace_id", workspace.id)
    .eq("checksum", input.checksum)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      mode: "duplicate",
      existingFileId: (existing as { id: string }).id,
      displayName:
        (existing as { display_name: string | null }).display_name ?? displayName,
    };
  }

  // UUID-based key under the caller's workspace folder (never the user filename).
  const path = buildStorageKey(
    workspace.id,
    crypto.randomUUID(),
    input.mime,
    originalFileName
  );

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "สร้างลิงก์อัปโหลดไม่สำเร็จ" };
  }

  return {
    ok: true,
    mode: "ready",
    path: data.path,
    token: data.token,
    displayName,
    extension,
  };
}

/** Step 2: after the browser finished uploading, record the metadata row. */
export async function finalizeUpload(
  input: FinalizeInput
): Promise<FinalizeResult> {
  const { user } = await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace หรือไม่มีสิทธิ์" };

  // The path MUST be inside this workspace's folder — never trust a raw path.
  const expectedPrefix = `workspaces/${workspace.id}/learning-sources/`;
  if (!input.path.startsWith(expectedPrefix)) {
    return { ok: false, error: "เส้นทางไฟล์ไม่ถูกต้อง" };
  }
  const metaErr = validateFileMeta(input.mime, input.originalFileName, input.sizeBytes);
  if (metaErr) return { ok: false, error: metaErr };

  const supabase = await createServerSupabase();

  // Verify the object really exists (and read its true size) before recording.
  const folder = input.path.slice(0, input.path.lastIndexOf("/"));
  const filename = input.path.slice(input.path.lastIndexOf("/") + 1);
  const { data: listed } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(folder, { search: filename, limit: 1 });
  const object = (listed ?? []).find((o) => o.name === filename);
  if (!object) {
    return { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด (อาจอัปโหลดไม่สำเร็จ)" };
  }
  const realSize =
    (object.metadata as { size?: number } | null)?.size ?? input.sizeBytes;

  // Race-safe dedup: if the same content got recorded meanwhile, drop this one.
  const { data: existing } = await supabase
    .from("source_files")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("checksum", input.checksum)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await supabase.storage.from(STORAGE_BUCKET).remove([input.path]);
    return { ok: true, skippedDuplicate: true, fileId: (existing as { id: string }).id };
  }

  const { data: inserted, error: dbErr } = await supabase
    .from("source_files")
    .insert({
      workspace_id: workspace.id,
      external_id: null,
      title: input.displayName,
      display_name: input.displayName,
      original_file_name: input.originalFileName,
      extension: input.extension || null,
      file_type: input.mime,
      mime_type: input.mime,
      checksum: input.checksum,
      storage_bucket: STORAGE_BUCKET,
      storage_path: input.path,
      size_bytes: realSize,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (dbErr) {
    // Cleanup the orphaned object so storage and DB stay consistent.
    await supabase.storage.from(STORAGE_BUCKET).remove([input.path]);
    return { ok: false, error: dbErr.message };
  }

  revalidatePath("/imports");
  revalidatePath("/assessments");
  return { ok: true, fileId: (inserted as { id: string }).id };
}

/** Create a short-lived signed URL for reading a private source file. */
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
  if (!row || row.workspace_id !== workspace.id || !row.storage_path) {
    return { ok: false, error: "ไม่พบไฟล์หรือไม่มีสิทธิ์เข้าถึง" };
  }

  const { data, error } = await supabase.storage
    .from(row.storage_bucket ?? STORAGE_BUCKET)
    .createSignedUrl(row.storage_path, 60 * 10);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "สร้างลิงก์ไม่สำเร็จ" };
  }
  return { ok: true, url: data.signedUrl };
}

/** Delete a source file: remove the storage object AND the DB row together. */
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
