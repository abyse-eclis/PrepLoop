/** Sanitize a filename to prevent path traversal / unsafe characters. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return (
    base
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 120) || "file"
  );
}

export interface ParsedFileName {
  originalFileName: string;
  displayName: string;
  extension: string; // lowercase, without dot; "" if none
}

/**
 * Split a filename into display name (without extension) and extension.
 * Preserves the original name verbatim (Thai, spaces, parentheses, etc.) —
 * only the storage KEY is ever sanitized, never the display name.
 */
export function parseFileName(name: string): ParsedFileName {
  const base = name.split(/[/\\]/).pop() ?? name;
  const trimmed = base.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return { originalFileName: trimmed, displayName: trimmed, extension: "" };
  }
  const extension = trimmed.slice(dot + 1).toLowerCase();
  const displayName = trimmed.slice(0, dot);
  return { originalFileName: trimmed, displayName, extension };
}

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/json": "json",
  "text/markdown": "md",
};

/**
 * Resolve a safe storage extension from the MIME type first (trusted server
 * value), falling back to the parsed filename extension.
 */
export function safeExtension(mimeType: string, fileName: string): string {
  const fromMime = EXT_BY_MIME[mimeType];
  if (fromMime) return fromMime;
  const { extension } = parseFileName(fileName);
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
}

/** Build a collision-free storage key. Display name is never used here. */
export function buildStorageKey(
  workspaceId: string,
  uuid: string,
  mimeType: string,
  fileName: string
): string {
  const ext = safeExtension(mimeType, fileName);
  return `workspaces/${workspaceId}/learning-sources/${uuid}.${ext}`;
}
