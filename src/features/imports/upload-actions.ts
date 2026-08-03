"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser, getActiveWorkspace } from "@/lib/auth/workspace";
import { ALLOWED_UPLOAD_MIME, STORAGE_BUCKET, getMaxUploadBytes } from "@/lib/env";
import { parseFileName, buildStorageKey } from "@/lib/files";

export type UploadStatus =
  | "uploaded"
  | "skipped_duplicate"
  | "failed";

export interface UploadFileResult {
  originalFileName: string;
  status: UploadStatus;
  displayName?: string;
  error?: string;
  fileId?: string;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Upload ONE source file. One request per file keeps per-file status accurate
 * and prevents a single failure from failing the others.
 *
 * Security: the workspace is resolved from the server session — the client
 * never supplies workspace_id. MIME + extension + size are validated server
 * side. Storage keys are UUID-based (never the user filename). If the DB insert
 * fails after a successful upload, the storage object is deleted (no orphan).
 */
export async function uploadSingleSourceFile(
  formData: FormData
): Promise<UploadFileResult> {
  const { user } = await requireUser();
  const workspace = await getActiveWorkspace();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { originalFileName: "(ไม่ทราบชื่อ)", status: "failed", error: "ไม่พบไฟล์" };
  }
  const { originalFileName, displayName, extension } = parseFileName(file.name);

  if (!workspace) {
    return { originalFileName, status: "failed", error: "ไม่พบ workspace หรือไม่มีสิทธิ์" };
  }

  // Validate MIME (trusted server value) + extension consistency.
  const mime = file.type;
  if (!ALLOWED_UPLOAD_MIME.includes(mime as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    return {
      originalFileName,
      status: "failed",
      error: `ชนิดไฟล์ไม่รองรับ (${mime || "unknown"}) — รองรับ PDF, PNG, JPEG, JSON`,
    };
  }
  const allowedExt: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "application/json": ["json"],
  };
  if (extension && !allowedExt[mime]?.includes(extension)) {
    return {
      originalFileName,
      status: "failed",
      error: `นามสกุลไฟล์ (.${extension}) ไม่ตรงกับชนิดไฟล์จริง (${mime})`,
    };
  }

  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    return {
      originalFileName,
      status: "failed",
      error: `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.round(maxBytes / 1024 / 1024)}MB)`,
    };
  }
  if (file.size === 0) {
    return { originalFileName, status: "failed", error: "ไฟล์ว่างเปล่า" };
  }

  const buffer = await file.arrayBuffer();
  const checksum = await sha256Hex(buffer);

  const supabase = await createServerSupabase();

  // Content dedup: same checksum in this workspace -> skip (don't re-upload).
  const { data: existing } = await supabase
    .from("source_files")
    .select("id, display_name")
    .eq("workspace_id", workspace.id)
    .eq("checksum", checksum)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      originalFileName,
      status: "skipped_duplicate",
      displayName: (existing as { display_name: string | null }).display_name ?? displayName,
      fileId: (existing as { id: string }).id,
    };
  }

  // UUID-based storage key (never the user filename). Same name + different
  // content => different UUID => no collision, no silent overwrite.
  const objectId = crypto.randomUUID();
  const storageKey = buildStorageKey(workspace.id, objectId, mime, originalFileName);

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, buffer, { contentType: mime, upsert: false });
  if (uploadErr) {
    return { originalFileName, status: "failed", error: uploadErr.message };
  }

  const { data: inserted, error: dbErr } = await supabase
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
      checksum,
      storage_bucket: STORAGE_BUCKET,
      storage_path: storageKey,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (dbErr) {
    // Cleanup orphaned storage object so storage and DB stay consistent.
    await supabase.storage.from(STORAGE_BUCKET).remove([storageKey]);
    return { originalFileName, status: "failed", error: dbErr.message };
  }

  revalidatePath("/imports");
  revalidatePath("/assessments");
  return {
    originalFileName,
    displayName,
    status: "uploaded",
    fileId: (inserted as { id: string }).id,
  };
}

/** Create a short-lived signed URL for a private source file. */
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
    .createSignedUrl(row.storage_path, 60 * 10); // 10 minutes
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
