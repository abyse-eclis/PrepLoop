"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { ALLOWED_UPLOAD_MIME, STORAGE_BUCKET, getMaxUploadBytes } from "@/lib/env";
import { sanitizeFilename } from "@/lib/files";

export interface UploadResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function uploadSourceFile(formData: FormData): Promise<UploadResult> {
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "กรุณานำเข้า Workspace Config ก่อน" };

  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  if (!(file instanceof File)) {
    return { ok: false, error: "ไม่พบไฟล์" };
  }
  if (!ALLOWED_UPLOAD_MIME.includes(file.type as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    return {
      ok: false,
      error: `ชนิดไฟล์ไม่รองรับ (${file.type || "unknown"}) — รองรับ PDF, PNG, JPEG, JSON`,
    };
  }
  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.round(maxBytes / 1024 / 1024)}MB)`,
    };
  }

  const safeName = sanitizeFilename(file.name);
  const path = `${workspace.id}/${crypto.randomUUID()}-${safeName}`;

  const supabase = await createServerSupabase();
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { error: dbErr } = await supabase.from("source_files").insert({
    workspace_id: workspace.id,
    title: title || safeName,
    file_type: file.type,
    storage_path: path,
    size_bytes: file.size,
  });
  if (dbErr) return { ok: false, error: dbErr.message };

  revalidatePath("/imports");
  revalidatePath("/assessments");
  return { ok: true, message: `อัปโหลด "${title || safeName}" สำเร็จ` };
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
    .select("storage_path, workspace_id")
    .eq("id", sourceFileId)
    .maybeSingle();
  const row = file as { storage_path: string | null; workspace_id: string } | null;
  if (!row || row.workspace_id !== workspace.id || !row.storage_path) {
    return { ok: false, error: "ไม่พบไฟล์หรือไม่มีสิทธิ์เข้าถึง" };
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(row.storage_path, 60 * 10); // 10 minutes
  if (error || !data) return { ok: false, error: error?.message ?? "สร้างลิงก์ไม่สำเร็จ" };
  return { ok: true, url: data.signedUrl };
}
