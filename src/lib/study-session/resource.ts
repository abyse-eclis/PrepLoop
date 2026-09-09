import type { ResourceKind, SessionResource } from "./types";

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  smartmathpro: "SmartMathPro",
  youtube: "YouTube",
  document: "เอกสาร",
  link: "ลิงก์",
};

export const RESOURCE_OPEN_LABELS: Record<ResourceKind, string> = {
  smartmathpro: "เปิด SmartMathPro",
  youtube: "เปิด YouTube",
  document: "เปิดเอกสาร",
  link: "เปิดลิงก์",
};

const DOCUMENT_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "notion.so",
  "notion.site",
  "dropbox.com",
  "onedrive.live.com",
];
const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Classify a resource URL by provider. Only the badge/icon/button label depend
 * on this — every other card behaviour is identical across kinds.
 */
export function detectResourceKind(url: string, sourceType?: string | null): ResourceKind {
  const hint = (sourceType ?? "").toLowerCase();
  if (hint.includes("smartmath")) return "smartmathpro";
  if (hint.includes("youtube")) return "youtube";
  if (hint.includes("pdf") || hint.includes("document") || hint.includes("doc")) {
    return "document";
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (hostMatches(host, "smartmathpro.com")) return "smartmathpro";
    if (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")) return "youtube";
    if (DOCUMENT_HOSTS.some((d) => hostMatches(host, d))) return "document";
    const path = parsed.pathname.toLowerCase();
    if (DOCUMENT_EXTENSIONS.some((ext) => path.endsWith(ext))) return "document";
  } catch {
    // fall through
  }
  return "link";
}

export function isHttpUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}

export function buildSessionResource(
  url: string | null | undefined,
  options: { sourceName?: string | null; sourceType?: string | null } = {}
): SessionResource | null {
  if (!isHttpUrl(url)) return null;
  const kind = detectResourceKind(url, options.sourceType);
  return {
    url,
    kind,
    label: RESOURCE_OPEN_LABELS[kind],
    sourceName: options.sourceName?.trim() ? options.sourceName.trim() : null,
  };
}
