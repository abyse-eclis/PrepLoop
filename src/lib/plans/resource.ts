import type { PlanItem } from "@/types/db";
import type { PlanItemInput } from "@/lib/schemas/study-plan";
import { resolveCanonicalResource } from "@/lib/plans/canonical-resources";

export const DEFAULT_RESOURCE_LABEL = "เปิดลิงก์";
export const YOUTUBE_RESOURCE_LABEL = "เปิดวิดีโอ";
export const GENERIC_RESOURCE_LABEL = "เปิดแหล่งเรียน";

export function isValidResourceUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}

export function isYoutubeResourceUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host.endsWith(".youtu.be")
    );
  } catch {
    return false;
  }
}

export function getResourceButtonLabel(url: string): string {
  return isYoutubeResourceUrl(url)
    ? YOUTUBE_RESOURCE_LABEL
    : GENERIC_RESOURCE_LABEL;
}

export function normalizeResourceLabel(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : DEFAULT_RESOURCE_LABEL;
}

function normalizeSourceName(value: unknown): string | null {
  const label = normalizeResourceLabel(value);
  return label === DEFAULT_RESOURCE_LABEL ||
    label === YOUTUBE_RESOURCE_LABEL ||
    label === GENERIC_RESOURCE_LABEL
    ? null
    : label;
}

export function getResourceUrlFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;
  if (isValidResourceUrl(metadata.videoUrl)) return metadata.videoUrl;
  if (isValidResourceUrl(metadata.resourceUrl)) return metadata.resourceUrl;
  return null;
}

export function getPlanInputResource(item: {
  resourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  if (isValidResourceUrl(item.resourceUrl)) return item.resourceUrl;
  const metaUrl = getResourceUrlFromMetadata(item.metadata);
  if (metaUrl) return metaUrl;
  const canonical = resolveCanonicalResource(item);
  return canonical ? canonical.url : null;
}

export function getPlanItemResource(item: PlanItem): {
  url: string;
  label: string;
  sourceName: string | null;
  tooltip: string;
} | null {
  let url = isValidResourceUrl(item.resource_url)
    ? item.resource_url
    : getResourceUrlFromMetadata(item.metadata);

  let sourceLabel = item.resource_label;

  if (!url) {
    const canonical = resolveCanonicalResource(item);
    if (canonical) {
      url = canonical.url;
      if (!sourceLabel) sourceLabel = canonical.label;
    }
  }

  if (!url) return null;

  const label = getResourceButtonLabel(url);

  return {
    url,
    label,
    sourceName: normalizeSourceName(sourceLabel),
    tooltip: `${label}ในแท็บใหม่`,
  };
}

export function toExportablePlanItem(
  item: PlanItemInput
): PlanItemInput & { resourceUrl?: string; resourceLabel?: string } {
  const url = getPlanInputResource(item);
  if (!url) return item;

  return {
    ...item,
    resourceUrl: url,
    resourceLabel: normalizeResourceLabel(item.resourceLabel),
  };
}
