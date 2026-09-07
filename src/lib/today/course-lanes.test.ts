import { describe, expect, it } from "vitest";
import {
  buildCourseLanes,
  cardDedupeKey,
  cardSourceLine,
  cardTitle,
  type LaneSourceItem,
} from "./course-lanes";
import type { StudyResource } from "@/lib/resources/types";

function resource(overrides: Partial<StudyResource> = {}): StudyResource {
  return {
    id: "r1",
    planItemId: "item-1",
    tier: "PAID",
    type: "COURSE",
    provider: "SmartMathPro",
    title: "พิชิต A-Level คณิต 1",
    url: null,
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

function entry(overrides: Partial<LaneSourceItem> = {}): LaneSourceItem {
  return {
    item: {
      id: "item-1",
      subject: "A_LEVEL_MATH_1",
      topic: "จำนวนจริง",
      instructions: "",
      course_code: "M110",
      lesson_from: null,
      lesson_to: null,
      activity_type: "course",
      target_minutes: 120,
      resource_label: null,
    },
    status: "not_started",
    actualMinutes: 0,
    executionState: "not_started",
    resources: [],
    ...overrides,
  };
}

describe("card text", () => {
  it("leads a purchased course with its code and today's topic", () => {
    expect(cardTitle(resource(), "จำนวนจริง")).toBe("M110 — จำนวนจริง");
  });

  it("uses the resource's own name when there is no course code", () => {
    expect(
      cardTitle(
        resource({ courseCode: null, title: "จำนวนจริง ม.4" }),
        "จำนวนจริง"
      )
    ).toBe("จำนวนจริง ม.4");
  });

  it("moves the course name to the source line, without repeating the title", () => {
    expect(cardSourceLine(resource(), "M110 — จำนวนจริง")).toBe(
      "SmartMathPro · พิชิต A-Level คณิต 1"
    );
    expect(
      cardSourceLine(
        resource({ courseCode: null, title: "จำนวนจริง ม.4", provider: "YouTube" }),
        "จำนวนจริง ม.4"
      )
    ).toBe("YouTube");
  });
});

describe("flattening today into two streams", () => {
  it("splits every resource into the paid or the free lane", () => {
    const lanes = buildCourseLanes([
      entry({
        resources: [
          resource({ id: "p1" }),
          resource({
            id: "f1",
            tier: "FREE",
            type: "YOUTUBE",
            provider: "YouTube",
            courseCode: null,
            url: "https://youtu.be/a",
            title: "จำนวนจริง ม.4",
          }),
        ],
      }),
    ]);

    expect(lanes.paid.map((card) => card.title)).toEqual(["M110 — จำนวนจริง"]);
    expect(lanes.free.map((card) => card.title)).toEqual(["จำนวนจริง ม.4"]);
    expect(lanes.total).toBe(2);
  });

  it("puts each course of the day in the paid lane as its own card", () => {
    const lanes = buildCourseLanes([
      entry({ resources: [resource({ id: "a", courseCode: "M110" })] }),
      entry({
        item: { ...entry().item, id: "item-2", subject: "PHYSICS", topic: "การเคลื่อนที่" },
        resources: [resource({ id: "b", courseCode: "X003", planItemId: "item-2" })],
      }),
      entry({
        item: { ...entry().item, id: "item-3", subject: "TGAT2", topic: "การคิด" },
        resources: [resource({ id: "c", courseCode: "L018", planItemId: "item-3" })],
      }),
    ]);

    expect(lanes.paid.map((card) => card.title)).toEqual([
      "M110 — จำนวนจริง",
      "X003 — การเคลื่อนที่",
      "L018 — การคิด",
    ]);
    expect(lanes.free).toHaveLength(0);
  });

  it("carries the parent item's subject, topic and timer onto the card", () => {
    const [card] = buildCourseLanes([
      entry({ actualMinutes: 31, status: "studying", executionState: "in_progress" , resources: [resource()] }),
    ]).paid;

    expect(card).toMatchObject({
      subject: "A_LEVEL_MATH_1",
      topic: "จำนวนจริง",
      planItemId: "item-1",
      targetMinutes: 120,
      actualMinutes: 31,
      progressPercent: 26,
      itemStatus: "studying",
      isCurrent: true,
    });
  });

  it("badges only the first queue item as current", () => {
    const lanes = buildCourseLanes([
      entry({ resources: [resource({ id: "a" })] }),
      entry({
        item: { ...entry().item, id: "item-2" },
        resources: [resource({ id: "b", courseCode: "X003", planItemId: "item-2" })],
      }),
    ]);

    expect(lanes.paid.map((card) => card.isCurrent)).toEqual([true, false]);
  });
});

describe("deduplication", () => {
  it("does not render the same course twice from legacy columns and resources[]", () => {
    const lanes = buildCourseLanes([
      entry({
        resources: [
          resource({ id: "legacy:course:item-1", isLegacy: true, legacyKey: "legacy:course" }),
          resource({ id: "stored-1", provider: "SmartMathPro" }),
        ],
      }),
    ]);

    expect(lanes.paid).toHaveLength(1);
    // The stored row wins over the one derived from legacy columns.
    expect(lanes.paid[0]!.resource?.id).toBe("stored-1");
    expect(lanes.paid[0]!.resource?.isLegacy).toBe(false);
  });

  it("keeps the same course as separate cards under different plan items", () => {
    const lanes = buildCourseLanes([
      entry({ resources: [resource({ id: "a" })] }),
      entry({
        item: { ...entry().item, id: "item-2", topic: "เลขยกกำลัง" },
        resources: [resource({ id: "b", planItemId: "item-2" })],
      }),
    ]);

    expect(lanes.paid).toHaveLength(2);
    expect(lanes.paid.map((card) => card.title)).toEqual([
      "M110 — จำนวนจริง",
      "M110 — เลขยกกำลัง",
    ]);
  });

  it("separates two untitled-source clips that share no code or url", () => {
    const base = { tier: "FREE" as const, courseCode: null, url: null };
    expect(
      cardDedupeKey(resource({ ...base, title: "คลิป A" }), "item-1")
    ).not.toBe(cardDedupeKey(resource({ ...base, title: "คลิป B" }), "item-1"));
  });
});

describe("legacy plans", () => {
  it("shows a legacy course-code item in the paid lane", () => {
    const lanes = buildCourseLanes([
      entry({
        resources: [
          resource({
            id: "legacy:course:item-1",
            isLegacy: true,
            legacyKey: "legacy:course",
            provider: null,
            title: "จำนวนจริง",
          }),
        ],
      }),
    ]);

    expect(lanes.paid).toHaveLength(1);
    expect(lanes.paid[0]!.title).toBe("M110 — จำนวนจริง");
    expect(lanes.other).toHaveLength(0);
  });

  it("never drops plan work that names no source at all", () => {
    const lanes = buildCourseLanes([
      entry({
        item: {
          ...entry().item,
          id: "mock-1",
          course_code: null,
          topic: "Mock A-Level คณิต 1",
          activity_type: "mock",
        },
        resources: [],
      }),
    ]);

    expect(lanes.paid).toHaveLength(0);
    expect(lanes.free).toHaveLength(0);
    expect(lanes.other.map((card) => card.title)).toEqual([
      "Mock A-Level คณิต 1",
    ]);
    expect(lanes.total).toBe(1);
  });
});

describe("ordering", () => {
  it("keeps plan order in the paid lane, then resource sort order", () => {
    const lanes = buildCourseLanes([
      entry({
        resources: [
          resource({ id: "b", courseCode: "K001", sortOrder: 2, title: "ชีท" }),
          resource({ id: "a", courseCode: "M110", sortOrder: 0 }),
        ],
      }),
      entry({
        item: { ...entry().item, id: "item-2", topic: "การเคลื่อนที่" },
        resources: [resource({ id: "c", courseCode: "X003", planItemId: "item-2" })],
      }),
    ]);

    expect(lanes.paid.map((card) => card.resource?.courseCode)).toEqual([
      "M110",
      "K001",
      "X003",
    ]);
  });

  it("leads the free lane with the topic in progress, then repair, prep, recap", () => {
    const free = (id: string, role: string | null, itemId: string) =>
      resource({
        id,
        tier: "FREE",
        type: "YOUTUBE",
        courseCode: null,
        url: `https://youtu.be/${id}`,
        planItemId: itemId,
        metadata: role ? { role } : null,
        title: id,
      });

    const lanes = buildCourseLanes([
      // current item
      entry({ resources: [free("current-recap", "RECAP", "item-1")] }),
      entry({
        item: { ...entry().item, id: "item-2" },
        resources: [
          free("later-recap", "RECAP", "item-2"),
          free("later-repair", "ERROR_REPAIR", "item-2"),
          free("later-foundation", "FOUNDATION", "item-2"),
          free("later-plain", null, "item-2"),
        ],
      }),
    ]);

    // Spec order: current topic, ERROR_REPAIR, FOUNDATION/PREVIEW, RECAP,
    // then anything untagged.
    expect(lanes.free.map((card) => card.title)).toEqual([
      "current-recap",
      "later-repair",
      "later-foundation",
      "later-recap",
      "later-plain",
    ]);
  });
});
