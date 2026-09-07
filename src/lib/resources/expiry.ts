/**
 * Paid access expiry ("สิทธิ์การเรียน").
 *
 * Only what the data actually says is shown: days left come from `expiresAt`,
 * and `limitedWatchTime` is a flag, never an invented hours-remaining number.
 */

import type { ResourceAccessType, StudyResource } from "./types";
import { RESOURCE_ACCESS_TYPE_LABELS } from "./types";

export type ExpiryLevel = "normal" | "soon" | "urgent" | "expired";

export interface ExpiryInfo {
  level: ExpiryLevel;
  /** Days from `today` to `expiresAt`; negative once expired. */
  days: number;
  label: string;
}

const MS_PER_DAY = 86_400_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toUtcTime(dateKey: string): number | null {
  if (!DATE_KEY.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** Whole days between two YYYY-MM-DD keys (b - a). */
export function daysUntil(today: string, target: string): number | null {
  const from = toUtcTime(today);
  const to = toUtcTime(target);
  if (from === null || to === null) return null;
  return Math.round((to - from) / MS_PER_DAY);
}

export function describeExpiry(
  expiresAt: string | null | undefined,
  today: string
): ExpiryInfo | null {
  if (!expiresAt) return null;
  const days = daysUntil(today, expiresAt);
  if (days === null) return null;

  if (days < 0) return { level: "expired", days, label: "หมดสิทธิ์แล้ว" };
  if (days <= 7) return { level: "urgent", days, label: `เหลือ ${days} วัน` };
  if (days <= 30) {
    return { level: "soon", days, label: `ใกล้หมดสิทธิ์ · ${days} วัน` };
  }
  return { level: "normal", days, label: `เหลือ ${days} วัน` };
}

export const EXPIRY_LEVEL_CLASS: Record<ExpiryLevel, string> = {
  normal: "text-muted-foreground",
  soon: "text-amber-600 dark:text-amber-400",
  urgent: "text-amber-700 dark:text-amber-300 font-medium",
  expired: "text-destructive font-medium",
};

export interface AccessInfo {
  expiry: ExpiryInfo | null;
  /** e.g. "ฟรี · ดูซ้ำได้" or "มีวันหมดสิทธิ์" — omitted when unknown. */
  accessLabel: string | null;
  limitedWatchTimeLabel: string | null;
}

const ACCESS_LABEL_OVERRIDES: Partial<Record<ResourceAccessType, string>> = {
  FREE: "ฟรี · ดูซ้ำได้",
};

export function describeAccess(
  resource: Pick<
    StudyResource,
    "accessType" | "expiresAt" | "limitedWatchTime" | "tier"
  >,
  today: string
): AccessInfo {
  const expiry = describeExpiry(resource.expiresAt, today);
  const accessType = resource.accessType;

  // With a concrete expiry on screen, "มีวันหมดสิทธิ์" only repeats it.
  const accessLabel =
    accessType && !(accessType === "EXPIRING" && expiry)
      ? (ACCESS_LABEL_OVERRIDES[accessType] ??
        RESOURCE_ACCESS_TYPE_LABELS[accessType])
      : null;

  return {
    expiry,
    accessLabel,
    limitedWatchTimeLabel: resource.limitedWatchTime ? "จำกัดเวลาเรียน" : null,
  };
}
