/** Client-safe upload constants (no secrets). Shared by client and server. */

export const ALLOWED_UPLOAD_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/json",
] as const;

export type AllowedMime = (typeof ALLOWED_UPLOAD_MIME)[number];

export const UPLOAD_ACCEPT_ATTR =
  "application/pdf,image/png,image/jpeg,application/json,.pdf,.png,.jpg,.jpeg,.json";

export const STORAGE_BUCKET = "study-sources";

export const ALLOWED_EXT_BY_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "application/json": ["json"],
};

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_UPLOAD_MIME as readonly string[]).includes(mime);
}

/**
 * Default STORAGE upload limit (MB) when no env override is set. This should
 * match the Supabase project "Global file size limit" (Free plan is fixed at
 * 50MB). Files larger than this are registered as metadata-only references
 * instead of being uploaded.
 */
export const DEFAULT_MAX_UPLOAD_MB = 50;

/** Max size (bytes) that can actually be uploaded to Storage. */
export function maxUploadBytes(): number {
  const raw =
    process.env.MAX_UPLOAD_SIZE_MB ??
    process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB;
  const mb = Number(raw ?? DEFAULT_MAX_UPLOAD_MB);
  return (
    Math.max(1, Number.isFinite(mb) ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024
  );
}

/**
 * Upper bound for metadata-only reference registration (no bytes stored), just
 * to reject absurd values. Generous since nothing is actually uploaded.
 */
export function maxReferenceBytes(): number {
  return 2 * 1024 * 1024 * 1024; // 2 GB
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
