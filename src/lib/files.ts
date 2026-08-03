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
