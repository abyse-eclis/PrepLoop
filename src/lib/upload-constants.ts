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

/** Default max upload size (MB) when no env override is set. */
export const DEFAULT_MAX_UPLOAD_MB = 100;

/** Max upload size in bytes, readable on both client and server. */
export function maxUploadBytes(): number {
  const raw =
    process.env.MAX_UPLOAD_SIZE_MB ??
    process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB;
  const mb = Number(raw ?? DEFAULT_MAX_UPLOAD_MB);
  return (
    Math.max(1, Number.isFinite(mb) ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
