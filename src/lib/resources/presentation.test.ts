import { describe, expect, it } from "vitest";
import {
  MAX_CARD_BADGES,
  RESOURCE_OPEN_LABELS,
  resourceBadges,
  resourceDescription,
  resourceMetaLine,
  resourceRole,
  resourceSourceLine,
  resourceStudyMode,
  statusBadge,
} from "./presentation";
import type { StudyResource } from "./types";

const TODAY = "2026-09-07";

function resource(overrides: Partial<StudyResource> = {}): StudyResource {
  return {
    id: "r1",
    planItemId: "item-1",
    tier: "PAID",
    type: "COURSE",
    provider: "SmartMathPro",
    title: "พิชิต A-Level คณิต 1",
    url: "https://example.com/course",
    courseCode: "M110",
    lessonFrom: null,
    lessonTo: null,
    durationMinutes: null,
    status: "NOT_STARTED",
    accessType: null,
    expiresAt: null,
    limitedWatchTime: false,
    listenMode: false,
    sortOrder: 0,
    metadata: null,
    isLegacy: false,
    legacyKey: null,
    ...overrides,
  };
}

describe("card text", () => {
  it("joins provider and course code, and skips the missing half", () => {
    expect(resourceSourceLine(resource())).toBe("SmartMathPro — M110");
    expect(resourceSourceLine(resource({ courseCode: null }))).toBe(
      "SmartMathPro"
    );
    expect(
      resourceSourceLine(resource({ provider: null, courseCode: null }))
    ).toBeNull();
  });

  it("never renders a placeholder for a field the data lacks", () => {
    const bare = resource({
      provider: null,
      courseCode: null,
      durationMinutes: null,
      metadata: null,
    });
    expect(resourceDescription(bare)).toBeNull();
    expect(resourceSourceLine(bare)).toBeNull();
    // The type label is always known, so the meta line still has one part.
    expect(resourceMetaLine(bare)).toBe("คอร์ส");
  });

  it("prefers an explicit lesson count over the lesson range", () => {
    expect(
      resourceMetaLine(
        resource({
          lessonFrom: "032",
          lessonTo: "035",
          metadata: { lessonCount: 12 },
        })
      )
    ).toBe("คอร์ส · 12 บทเรียน");

    expect(
      resourceMetaLine(resource({ lessonFrom: "032", lessonTo: "035" }))
    ).toBe("คอร์ส · คลิป 032–035");
  });

  it("drops the type label when the provider already says it", () => {
    expect(
      resourceMetaLine(
        resource({
          tier: "FREE",
          type: "YOUTUBE",
          provider: "YouTube",
          durationMinutes: 28,
        })
      )
    ).toBe("28 นาที");
  });

  it("adds duration when the resource has one", () => {
    expect(
      resourceMetaLine(
        resource({ type: "YOUTUBE", tier: "FREE", durationMinutes: 28 })
      )
    ).toBe("YouTube · 28 นาที");
  });

  it("reads a description from metadata only", () => {
    expect(
      resourceDescription(resource({ metadata: { description: "สรุปจำนวนจริง" } }))
    ).toBe("สรุปจำนวนจริง");
    expect(resourceDescription(resource({ metadata: { description: "  " } }))).toBeNull();
  });
});

describe("study mode and role", () => {
  it("treats listenMode as LISTEN without metadata", () => {
    expect(resourceStudyMode(resource({ listenMode: true }))).toBe("LISTEN");
    expect(resourceStudyMode(resource())).toBeNull();
  });

  it("reads FOCUS / HYBRID from metadata, case-insensitively", () => {
    expect(resourceStudyMode(resource({ metadata: { studyMode: "focus" } }))).toBe(
      "FOCUS"
    );
    expect(resourceStudyMode(resource({ metadata: { mode: "Hybrid" } }))).toBe(
      "HYBRID"
    );
  });

  it("ignores unknown mode and role values", () => {
    expect(resourceStudyMode(resource({ metadata: { studyMode: "???" } }))).toBeNull();
    expect(resourceRole(resource({ metadata: { role: "???" } }))).toBeNull();
  });

  it("normalizes a spaced role token", () => {
    expect(resourceRole(resource({ metadata: { role: "error repair" } }))).toBe(
      "ERROR_REPAIR"
    );
  });
});

describe("card badges", () => {
  it("puts access problems before study hints", () => {
    const badges = resourceBadges(
      resource({
        expiresAt: "2026-09-14",
        limitedWatchTime: true,
        listenMode: true,
        metadata: { role: "RECAP" },
      }),
      TODAY
    );

    expect(badges.map((badge) => badge.key)).toEqual([
      "expiry",
      "limited",
      "mode",
      "role",
    ]);
    expect(badges[0]!.label).toBe("ใกล้หมดสิทธิ์ · 7 วัน");
    expect(badges.slice(0, MAX_CARD_BADGES)).toHaveLength(3);
  });

  it("labels an expired course", () => {
    const badges = resourceBadges(resource({ expiresAt: "2026-09-01" }), TODAY);
    expect(badges[0]).toMatchObject({ label: "หมดสิทธิ์แล้ว", tone: "danger" });
  });

  it("keeps a comfortable expiry as a quiet badge, last", () => {
    const badges = resourceBadges(
      resource({ expiresAt: "2027-07-10", listenMode: true }),
      TODAY
    );
    expect(badges[0]!.key).toBe("mode");
    expect(badges.at(-1)).toMatchObject({ key: "expiry-normal", tone: "neutral" });
  });

  it("returns nothing for a plain resource", () => {
    expect(resourceBadges(resource(), TODAY)).toEqual([]);
  });

  it("shows the listen badge label used by the card icon", () => {
    const badges = resourceBadges(resource({ listenMode: true }), TODAY);
    expect(badges[0]).toMatchObject({ key: "mode", label: "ฟังผ่านได้" });
  });
});

describe("status and open labels", () => {
  it("LISTENED reads as its own state, not completion", () => {
    expect(statusBadge(resource({ status: "LISTENED" })).label).toBe(
      "ฟังผ่านแล้ว"
    );
    expect(statusBadge(resource({ status: "COMPLETED" })).label).toBe("เรียนแล้ว");
  });

  it("words the open button per resource type", () => {
    expect(RESOURCE_OPEN_LABELS.COURSE).toBe("เปิดคอร์ส");
    expect(RESOURCE_OPEN_LABELS.YOUTUBE).toBe("เปิด YouTube");
    expect(RESOURCE_OPEN_LABELS.DOCUMENT).toBe("เปิดเอกสาร");
    expect(RESOURCE_OPEN_LABELS.PRACTICE).toBe("เปิดโจทย์");
  });
});
