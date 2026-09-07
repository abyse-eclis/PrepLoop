/**
 * Hybrid learning resources.
 *
 * A study plan item says *what* to study (the topic); resources say *where* it
 * is studied from. They are split into two tiers so a purchased course and the
 * free clips around it never share one progress number.
 *
 * PrepLoop never plays a resource — every card is a link that opens in a new
 * tab. `listenMode` is metadata only (no player, no playback tracking).
 */

export const RESOURCE_TIERS = ["PAID", "FREE"] as const;
export type ResourceTier = (typeof RESOURCE_TIERS)[number];

export const RESOURCE_TYPES = [
  "COURSE",
  "YOUTUBE",
  "DOCUMENT",
  "WEBSITE",
  "PRACTICE",
  "MOCK",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_STATUSES = [
  "NOT_STARTED",
  "LISTENED",
  "IN_PROGRESS",
  "COMPLETED",
  "REVIEW_REQUIRED",
] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_ACCESS_TYPES = [
  "EXPIRING",
  "LIMITED_HOURS",
  "FREE",
  "PERMANENT",
] as const;
export type ResourceAccessType = (typeof RESOURCE_ACCESS_TYPES)[number];

export interface StudyResource {
  id: string;
  planItemId: string;
  tier: ResourceTier;
  type: ResourceType;
  provider: string | null;
  title: string;
  url: string | null;
  courseCode: string | null;
  lessonFrom: string | null;
  lessonTo: string | null;
  durationMinutes: number | null;
  status: ResourceStatus;
  accessType: ResourceAccessType | null;
  /** YYYY-MM-DD, paid access expiry. */
  expiresAt: string | null;
  limitedWatchTime: boolean;
  listenMode: boolean;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  /**
   * True for resources derived on read from an item's legacy columns. They have
   * no row yet; changing their status materialises one (see `legacyKey`).
   */
  isLegacy: boolean;
  legacyKey: string | null;
}

export const RESOURCE_TIER_LABELS: Record<ResourceTier, string> = {
  PAID: "คอร์สที่ซื้อมา",
  FREE: "คอร์สฟรี",
};

export const RESOURCE_TIER_EMPTY_LABELS: Record<ResourceTier, string> = {
  PAID: "ยังไม่มีคอร์สที่ซื้อสำหรับหัวข้อนี้",
  FREE: "ยังไม่มีแหล่งเรียนฟรีสำหรับหัวข้อนี้",
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  COURSE: "คอร์ส",
  YOUTUBE: "YouTube",
  DOCUMENT: "เอกสาร",
  WEBSITE: "เว็บไซต์",
  PRACTICE: "แบบฝึกหัด",
  MOCK: "Mock",
};

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  LISTENED: "ฟังผ่านแล้ว",
  IN_PROGRESS: "กำลังเรียน",
  COMPLETED: "เรียนแล้ว",
  REVIEW_REQUIRED: "ต้องทบทวน",
};

/** Badge classes; kept theme-aware so light and dark both stay readable. */
export const RESOURCE_STATUS_CLASS: Record<ResourceStatus, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground",
  LISTENED:
    "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  IN_PROGRESS:
    "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
  COMPLETED:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  REVIEW_REQUIRED:
    "bg-purple-500/10 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300",
};

export const RESOURCE_ACCESS_TYPE_LABELS: Record<ResourceAccessType, string> = {
  EXPIRING: "มีวันหมดสิทธิ์",
  LIMITED_HOURS: "จำกัดชั่วโมงเรียน",
  FREE: "ฟรี",
  PERMANENT: "เรียนได้ตลอด",
};

/** Only COMPLETED counts as done — LISTENED is deliberately not completion. */
export function isResourceCompleted(status: ResourceStatus): boolean {
  return status === "COMPLETED";
}

export function isResourceTier(value: unknown): value is ResourceTier {
  return RESOURCE_TIERS.includes(value as ResourceTier);
}

export function isResourceType(value: unknown): value is ResourceType {
  return RESOURCE_TYPES.includes(value as ResourceType);
}

export function isResourceStatus(value: unknown): value is ResourceStatus {
  return RESOURCE_STATUSES.includes(value as ResourceStatus);
}

export function isResourceAccessType(
  value: unknown
): value is ResourceAccessType {
  return RESOURCE_ACCESS_TYPES.includes(value as ResourceAccessType);
}
