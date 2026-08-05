import type { PlanItem } from "@/types/db";
import type { PlanItemInput } from "@/lib/schemas/study-plan";

export const DEFAULT_RESOURCE_LABEL = "เปิดลิงก์";

export function isValidResourceUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}

export function normalizeResourceLabel(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : DEFAULT_RESOURCE_LABEL;
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
  return getResourceUrlFromMetadata(item.metadata);
}

export function getPlanItemResource(item: PlanItem): {
  url: string;
  label: string;
} | null {
  const url = isValidResourceUrl(item.resource_url)
    ? item.resource_url
    : getResourceUrlFromMetadata(item.metadata);
  if (!url) return null;

  return {
    url,
    label: normalizeResourceLabel(item.resource_label),
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
