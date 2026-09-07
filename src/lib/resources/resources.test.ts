import { describe, expect, it } from "vitest";
import {
  deriveLegacyResources,
  inferResourceTypeFromUrl,
  resourceStatusFromItemStatus,
  LEGACY_COURSE_KEY,
  LEGACY_LINK_KEY,
} from "./legacy";
import {
  groupResourcesByTier,
  summarizeResourceGroups,
  summarizeResourceProgress,
} from "./group";
import { daysUntil, describeAccess, describeExpiry } from "./expiry";
import { resolveItemResources, toStudyResource } from "./resolve";
import type { StudyResource } from "./types";
import type { StudyResourceRow } from "@/types/db";

function resource(overrides: Partial<StudyResource> = {}): StudyResource {
  return {
    id: "r1",
    planItemId: "item-1",
    tier: "FREE",
    type: "YOUTUBE",
    provider: "YouTube",
    title: "เลขยกกำลังและราก พื้นฐาน",
    url: "https://youtu.be/abc",
    courseCode: null,
    lessonFrom: null,
    lessonTo: null,
    durationMinutes: 28,
    status: "NOT_STARTED",
    accessType: "FREE",
    expiresAt: null,
    limitedWatchTime: false,
    listenMode: true,
    sortOrder: 0,
    metadata: null,
    isLegacy: false,
    legacyKey: null,
    ...overrides,
  };
}

function row(overrides: Partial<StudyResourceRow> = {}): StudyResourceRow {
  return {
    id: "row-1",
    workspace_id: "ws-1",
    study_plan_item_id: "item-1",
    tier: "PAID",
    type: "COURSE",
    provider: "SmartMathPro",
    title: "พิชิต A-Level คณิต 1",
    url: null,
    course_code: "M110",
    lesson_from: "032",
    lesson_to: "035",
    duration_minutes: null,
    status: "IN_PROGRESS",
    access_type: "EXPIRING",
    expires_at: "2027-01-01",
    limited_watch_time: false,
    listen_mode: false,
    sort_order: 0,
    legacy_key: null,
    metadata: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("legacy resource derivation", () => {
  it("maps a course code to a paid course resource", () => {
    const resources = deriveLegacyResources({
      id: "item-1",
      subject: "A_LEVEL_MATH_1",
      course_code: "M110",
      lesson_from: "032",
      lesson_to: "035",
      instructions: "จำนวนจริง",
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      tier: "PAID",
      type: "COURSE",
      courseCode: "M110",
      lessonFrom: "032",
      lessonTo: "035",
      title: "จำนวนจริง",
      isLegacy: true,
      legacyKey: LEGACY_COURSE_KEY,
    });
  });

  it("maps a YouTube link to a free resource alongside the paid course", () => {
    const resources = deriveLegacyResources({
      id: "item-1",
      subject: "A_LEVEL_ENGLISH",
      course_code: "E200",
      resource_url: "https://www.youtube.com/watch?v=abc",
      resource_label: "English by Chris",
      instructions: "Tense",
    });

    expect(resources.map((r) => r.tier)).toEqual(["PAID", "FREE"]);
    const free = resources[1]!;
    expect(free.type).toBe("YOUTUBE");
    expect(free.provider).toBe("YouTube");
    expect(free.accessType).toBe("FREE");
    expect(free.courseCode).toBeNull();
    expect(free.legacyKey).toBe(LEGACY_LINK_KEY);
  });

  it("treats an unknown link on a course item as that course's own link", () => {
    const resources = deriveLegacyResources({
      id: "item-1",
      subject: "A_LEVEL_ENGLISH",
      course_code: "E200",
      resource_url: "https://smartmathpro.example/course/E200",
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      tier: "PAID",
      url: "https://smartmathpro.example/course/E200",
    });
  });

  it("maps a bare non-YouTube link to a free website resource", () => {
    const resources = deriveLegacyResources({
      id: "item-1",
      subject: "TGAT1",
      resource_url: "https://example.com/reading",
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ tier: "FREE", type: "WEBSITE" });
  });

  it("resolves the canonical catalog when no url column is set", () => {
    const resources = deriveLegacyResources({
      id: "item-1",
      subject: "TGAT1",
      metadata: { englishMode: "tgat1_exposure" },
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]!.url).toContain("youtube.com");
    expect(resources[0]!.tier).toBe("FREE");
  });

  it("returns nothing for an item with no course and no link", () => {
    expect(
      deriveLegacyResources({ id: "item-1", subject: "PHYSICS" })
    ).toEqual([]);
  });

  it("mirrors the item status until the resource is materialised", () => {
    expect(resourceStatusFromItemStatus("completed")).toBe("COMPLETED");
    expect(resourceStatusFromItemStatus("studying")).toBe("IN_PROGRESS");
    expect(resourceStatusFromItemStatus("needs_review")).toBe(
      "REVIEW_REQUIRED"
    );
    expect(resourceStatusFromItemStatus("skipped")).toBe("NOT_STARTED");
    expect(resourceStatusFromItemStatus(null)).toBe("NOT_STARTED");
  });

  it("infers the type from the url host", () => {
    expect(inferResourceTypeFromUrl("https://youtu.be/x")).toBe("YOUTUBE");
    expect(inferResourceTypeFromUrl("https://m.youtube.com/watch?v=x")).toBe(
      "YOUTUBE"
    );
    expect(inferResourceTypeFromUrl("https://example.com")).toBe("WEBSITE");
  });
});

describe("grouping and progress", () => {
  it("splits tiers and sorts by sort order", () => {
    const groups = groupResourcesByTier([
      resource({ id: "b", tier: "FREE", sortOrder: 2 }),
      resource({ id: "a", tier: "PAID", sortOrder: 1, type: "COURSE" }),
      resource({ id: "c", tier: "FREE", sortOrder: 1 }),
    ]);

    expect(groups.paid.map((r) => r.id)).toEqual(["a"]);
    expect(groups.free.map((r) => r.id)).toEqual(["c", "b"]);
    expect(groups.total).toBe(3);
  });

  it("does not count LISTENED as completed", () => {
    const progress = summarizeResourceProgress([
      resource({ id: "1", status: "LISTENED" }),
      resource({ id: "2", status: "COMPLETED" }),
      resource({ id: "3", status: "IN_PROGRESS" }),
      resource({ id: "4", status: "REVIEW_REQUIRED" }),
    ]);

    expect(progress.completed).toBe(1);
    expect(progress.listened).toBe(1);
    expect(progress.percent).toBe(25);
  });

  it("keeps paid and free progress separate", () => {
    const groups = groupResourcesByTier([
      resource({ id: "p", tier: "PAID", status: "NOT_STARTED" }),
      resource({ id: "f", tier: "FREE", status: "COMPLETED" }),
    ]);
    const progress = summarizeResourceGroups(groups);

    expect(progress.PAID.percent).toBe(0);
    expect(progress.FREE.percent).toBe(100);
  });

  it("reports 0% instead of NaN for an empty column", () => {
    expect(summarizeResourceProgress([]).percent).toBe(0);
  });
});

describe("access and expiry", () => {
  it("counts whole days across a month boundary", () => {
    expect(daysUntil("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysUntil("2026-09-07", "2026-09-07")).toBe(0);
    expect(daysUntil("bad-date", "2026-09-07")).toBeNull();
  });

  it("labels each expiry band", () => {
    expect(describeExpiry("2027-01-16", "2026-09-07")).toMatchObject({
      level: "normal",
      label: "เหลือ 131 วัน",
    });
    expect(describeExpiry("2026-10-07", "2026-09-07")).toMatchObject({
      level: "soon",
      label: "ใกล้หมดสิทธิ์ · 30 วัน",
    });
    expect(describeExpiry("2026-09-14", "2026-09-07")).toMatchObject({
      level: "urgent",
      label: "เหลือ 7 วัน",
    });
    expect(describeExpiry("2026-09-06", "2026-09-07")).toMatchObject({
      level: "expired",
      label: "หมดสิทธิ์แล้ว",
    });
    expect(describeExpiry(null, "2026-09-07")).toBeNull();
  });

  it("describes free access and limited watch time without inventing hours", () => {
    const info = describeAccess(
      {
        tier: "FREE",
        accessType: "FREE",
        expiresAt: null,
        limitedWatchTime: false,
      },
      "2026-09-07"
    );
    expect(info.accessLabel).toBe("ฟรี · ดูซ้ำได้");
    expect(info.limitedWatchTimeLabel).toBeNull();

    const limited = describeAccess(
      {
        tier: "PAID",
        accessType: "LIMITED_HOURS",
        expiresAt: null,
        limitedWatchTime: true,
      },
      "2026-09-07"
    );
    expect(limited.limitedWatchTimeLabel).toBe("จำกัดเวลาเรียน");
  });
});

describe("resolving an item's resources", () => {
  const legacyItem = {
    id: "item-1",
    subject: "A_LEVEL_MATH_1",
    course_code: "M110",
    lesson_from: "032",
    resource_url: "https://youtu.be/abc",
    instructions: "จำนวนจริง",
  };

  it("falls back to legacy columns when the item has no rows", () => {
    const resolved = resolveItemResources(legacyItem, new Map());
    expect(resolved.map((r) => r.tier)).toEqual(["PAID", "FREE"]);
    expect(resolved.every((r) => r.isLegacy)).toBe(true);
  });

  it("does not duplicate a legacy resource that is already stored", () => {
    const stored = new Map([
      [
        "item-1",
        [resource({ id: "stored-1", url: "https://youtu.be/abc" })],
      ],
    ]);
    const resolved = resolveItemResources(legacyItem, stored);

    expect(resolved.filter((r) => r.url === "https://youtu.be/abc")).toHaveLength(
      1
    );
    // The paid course is not covered by the stored row, so it stays visible.
    expect(resolved.map((r) => r.tier).sort()).toEqual(["FREE", "PAID"]);
  });

  it("keeps stored rows only when they cover every legacy source", () => {
    const stored = new Map([
      [
        "item-1",
        [
          resource({ id: "s1", url: "https://youtu.be/abc" }),
          resource({
            id: "s2",
            tier: "PAID",
            type: "COURSE",
            url: null,
            courseCode: "M110",
          }),
        ],
      ],
    ]);
    const resolved = resolveItemResources(legacyItem, stored);
    expect(resolved.map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("maps a row and defaults unknown enum values safely", () => {
    expect(toStudyResource(row())).toMatchObject({
      tier: "PAID",
      type: "COURSE",
      courseCode: "M110",
      status: "IN_PROGRESS",
      accessType: "EXPIRING",
      isLegacy: false,
    });

    expect(
      toStudyResource(row({ tier: "??", type: "??", status: "??", access_type: "??" }))
    ).toMatchObject({
      tier: "FREE",
      type: "WEBSITE",
      status: "NOT_STARTED",
      accessType: null,
    });
  });
});
