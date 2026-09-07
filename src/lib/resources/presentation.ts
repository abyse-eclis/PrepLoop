/**
 * What a resource card shows, derived from data that already exists.
 *
 * Study mode and role live in the resource's free-form `metadata` (no schema
 * change): a plan can tag a clip as a RECAP meant for background listening.
 * Nothing here invents a value — a field the data does not carry is simply
 * omitted, so a card never renders "undefined", "null" or a bare dash.
 */

import { describeExpiry, type ExpiryLevel } from "./expiry";
import {
  RESOURCE_STATUS_CLASS,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type StudyResource,
} from "./types";

export const STUDY_MODES = ["LISTEN", "FOCUS", "HYBRID"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const RESOURCE_ROLES = [
  "FOUNDATION",
  "PREVIEW",
  "RECAP",
  "ERROR_REPAIR",
  "SUPPLEMENT",
] as const;
export type ResourceRole = (typeof RESOURCE_ROLES)[number];

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  LISTEN: "ฟังผ่านได้",
  FOCUS: "FOCUS",
  HYBRID: "HYBRID",
};

export const RESOURCE_ROLE_LABELS: Record<ResourceRole, string> = {
  FOUNDATION: "FOUNDATION",
  PREVIEW: "PREVIEW",
  RECAP: "RECAP",
  ERROR_REPAIR: "ERROR REPAIR",
  SUPPLEMENT: "SUPPLEMENT",
};

/** Button wording per resource type — every link opens in a new tab. */
export const RESOURCE_OPEN_LABELS: Record<ResourceType, string> = {
  COURSE: "เปิดคอร์ส",
  YOUTUBE: "เปิด YouTube",
  DOCUMENT: "เปิดเอกสาร",
  WEBSITE: "เปิดลิงก์",
  PRACTICE: "เปิดโจทย์",
  MOCK: "เปิดชุดข้อสอบ",
};

function readString(
  metadata: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeToken(value: string | null): string | null {
  return value ? value.toUpperCase().replace(/[\s-]+/g, "_") : null;
}

/**
 * FOCUS / HYBRID come from metadata; `listenMode` alone already means the
 * resource is fine to play in the background.
 */
export function resourceStudyMode(resource: StudyResource): StudyMode | null {
  const tagged = normalizeToken(
    readString(resource.metadata, "studyMode", "mode")
  );
  if (tagged === "LISTEN" || tagged === "LISTENING") return "LISTEN";
  if (tagged && STUDY_MODES.includes(tagged as StudyMode)) {
    return tagged as StudyMode;
  }
  return resource.listenMode ? "LISTEN" : null;
}

export function resourceRole(resource: StudyResource): ResourceRole | null {
  const tagged = normalizeToken(readString(resource.metadata, "role", "purpose"));
  return tagged && RESOURCE_ROLES.includes(tagged as ResourceRole)
    ? (tagged as ResourceRole)
    : null;
}

/** A one-or-two line subtitle, when the plan wrote one. */
export function resourceDescription(resource: StudyResource): string | null {
  return readString(resource.metadata, "description", "topic", "note", "summary");
}

/** "SmartMathPro — M110", or whichever half exists. */
export function resourceSourceLine(resource: StudyResource): string | null {
  const parts = [resource.provider, resource.courseCode].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  return parts.length > 0 ? parts.join(" — ") : null;
}

export function resourceLessonRange(resource: StudyResource): string | null {
  if (!resource.lessonFrom) return null;
  return resource.lessonTo && resource.lessonTo !== resource.lessonFrom
    ? `คลิป ${resource.lessonFrom}–${resource.lessonTo}`
    : `คลิป ${resource.lessonFrom}`;
}

/**
 * Type · lessons · duration — only the parts the resource actually has.
 *
 * The type label is dropped when the provider already says it ("YouTube"), so
 * a card never prints the same word twice.
 */
export function resourceMetaLine(resource: StudyResource): string | null {
  const lessonCount = resource.metadata?.lessonCount;
  const typeLabel = RESOURCE_TYPE_LABELS[resource.type];
  const parts = [
    resource.provider?.trim().toLowerCase() === typeLabel.toLowerCase()
      ? null
      : typeLabel,
    typeof lessonCount === "number" && lessonCount > 0
      ? `${lessonCount} บทเรียน`
      : resourceLessonRange(resource),
    resource.durationMinutes ? `${resource.durationMinutes} นาที` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type BadgeTone = "neutral" | "info" | "accent" | "warning" | "danger";

export interface ResourceBadge {
  key: string;
  label: string;
  tone: BadgeTone;
  /** Longer explanation for the badge's title attribute. */
  title?: string;
}

const TONE_BY_EXPIRY: Record<ExpiryLevel, BadgeTone> = {
  normal: "neutral",
  soon: "warning",
  urgent: "warning",
  expired: "danger",
};

/**
 * The badges worth the card's space, most important first.
 *
 * Access problems outrank study hints — an expired course changes what the
 * user can do today. Callers cap the list (see MAX_CARD_BADGES) and leave the
 * rest to the detail view.
 */
export function resourceBadges(
  resource: StudyResource,
  today: string
): ResourceBadge[] {
  const badges: ResourceBadge[] = [];
  const expiry = describeExpiry(resource.expiresAt, today);

  if (expiry && expiry.level !== "normal") {
    badges.push({
      key: "expiry",
      label:
        expiry.level === "expired"
          ? "หมดสิทธิ์แล้ว"
          : `ใกล้หมดสิทธิ์ · ${expiry.days} วัน`,
      tone: TONE_BY_EXPIRY[expiry.level],
      title: `สิทธิ์เรียน: ${expiry.label}`,
    });
  }

  if (resource.limitedWatchTime) {
    badges.push({
      key: "limited",
      label: "จำกัดเวลาเรียน",
      tone: "warning",
      title: "คอร์สนี้จำกัดเวลาเรียนรวม",
    });
  }

  const mode = resourceStudyMode(resource);
  if (mode) {
    badges.push({
      key: "mode",
      label: STUDY_MODE_LABELS[mode],
      tone: mode === "LISTEN" ? "info" : "accent",
      title:
        mode === "LISTEN"
          ? "เปิดฟังระหว่างทำงานอื่นได้ (ไม่นับว่าเรียนจบ)"
          : undefined,
    });
  }

  const role = resourceRole(resource);
  if (role) {
    badges.push({
      key: "role",
      label: RESOURCE_ROLE_LABELS[role],
      tone: "neutral",
    });
  }

  if (expiry && expiry.level === "normal") {
    badges.push({
      key: "expiry-normal",
      label: `สิทธิ์ ${expiry.label}`,
      tone: "neutral",
    });
  }

  return badges;
}

/** Keeps a card readable: the rest of the metadata lives in the detail view. */
export const MAX_CARD_BADGES = 3;

export function statusBadge(resource: StudyResource): {
  label: string;
  className: string;
} {
  return {
    label: RESOURCE_STATUS_LABELS[resource.status],
    className: RESOURCE_STATUS_CLASS[resource.status],
  };
}
