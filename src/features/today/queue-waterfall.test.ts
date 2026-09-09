import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test-utils/fake-supabase";

/**
 * Measures the request waterfall of the /today route (layout auth + page
 * workspace lookup + study queue) against a latency-simulating Supabase fake.
 *
 * The number of *sequential* round-trips is what a remote database turns into
 * seconds, so this test pins the depth and prints the simulated wall time.
 */

const LATENCY = 25;
const DATE = "2026-09-08";
const WS = "ws-1";

const fake = createFakeSupabase({
  latencyMs: LATENCY,
  tables: {
    workspaces: [
      {
        id: WS,
        user_id: "user-1",
        name: "Test",
        timezone: "Asia/Bangkok",
        start_date: "2026-08-01",
        daily_target_minutes: 480,
        nap_target_min: 30,
        nap_target_max: 60,
      },
    ],
    study_plan_versions: [
      {
        id: "v1",
        workspace_id: WS,
        parent_version_id: null,
        version_number: 1,
        name: "Plan",
        status: "active",
        start_date: "2026-08-01",
        end_date: "2026-12-01",
      },
    ],
    study_plan_days: [{ target_minutes: 480, nap_target_minutes: 45 }],
    study_plan_items: ({ select }) => {
      if (select.includes("item_status_overrides")) {
        return [{ course_code: "K001", lesson_to: "001", item_status_overrides: { status: "completed" } }];
      }
      if (select === "id, stable_external_id") {
        return [{ id: "p-old", stable_external_id: "s2" }];
      }
      return [1, 2, 3].map((n) => ({
        id: `p${n}`,
        workspace_id: WS,
        plan_version_id: "v1",
        plan_day_id: "d1",
        date: DATE,
        order_index: n,
        scheduled_at: null,
        stable_external_id: `s${n}`,
        subject: "MATHEMATICS",
        course_code: "K001",
        lesson_from: `00${n}`,
        lesson_to: `00${n}`,
        activity_type: "course",
        assessment_source_id: null,
        target_minutes: 60,
        priority: "high",
        instructions: "",
        resource_url: null,
        resource_label: null,
        review_reference_ids: [],
        metadata: null,
        created_at: "2026-08-01T00:00:00Z",
      }));
    },
    item_status_overrides: [
      { id: "o1", plan_item_id: "p1", status: "studying", actual_lesson_from: null, actual_lesson_to: null },
      { id: "o2", plan_item_id: "p-old", status: "studying", actual_lesson_from: null, actual_lesson_to: null },
    ],
    study_sessions: [
      {
        id: "sess-1",
        workspace_id: WS,
        plan_item_id: "p1",
        custom_study_item_id: null,
        source_activity_id: "s1",
        session_date: DATE,
        start_time: "09:00",
        end_time: "09:30",
        duration_minutes: 30,
        status: "completed",
      },
      {
        id: "sess-2",
        workspace_id: WS,
        plan_item_id: null,
        custom_study_item_id: "c1",
        source_activity_id: null,
        session_date: DATE,
        start_time: "10:00",
        end_time: "10:15",
        duration_minutes: 15,
        status: "completed",
      },
    ],
    custom_study_items: [
      {
        id: "c1",
        workspace_id: WS,
        study_date: DATE,
        exam_category: "TGAT",
        subject: "TGAT1",
        custom_subject: null,
        title: "Reading",
        url: "https://youtu.be/abc",
        estimated_minutes: 30,
        notes: null,
        status: "not_started",
        created_at: "2026-09-08T00:00:00Z",
        updated_at: "2026-09-08T00:00:00Z",
      },
    ],
    course_lessons: [
      {
        id: "l1",
        lesson_number: "001",
        external_id: "k001-001",
        title: "คลิป 001",
        lesson_url: "https://smartmathpro.com/lesson/1",
        source_type: "smartmathpro",
        prerequisite_lesson_ids: [],
        courses: { code: "K001" },
      },
    ],
    review_tasks: [],
    assessment_sources: [],
  },
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => fake.client,
  createServiceSupabase: () => fake.client,
}));

// Simulate one React Server Component request: `cache()` memoizes per request.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const memo = new Map<unknown, Map<string, unknown>>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
      return ((...args: unknown[]) => {
        const key = JSON.stringify(args);
        let byArgs = memo.get(fn);
        if (!byArgs) {
          byArgs = new Map();
          memo.set(fn, byArgs);
        }
        if (!byArgs.has(key)) byArgs.set(key, fn(...(args as never[])));
        return byArgs.get(key);
      }) as unknown as T;
    },
  };
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

describe("/today request waterfall", () => {
  beforeEach(() => fake.stats.reset());

  it("loads layout auth + workspace + study queue in a shallow waterfall", async () => {
    const { requireUser, getActiveWorkspace } = await import("@/lib/auth/workspace");
    const { getStudyQueue } = await import("@/features/today/data");

    const started = performance.now();
    await requireUser(); // (app)/layout.tsx
    const workspace = await getActiveWorkspace(); // today/page.tsx
    expect(workspace?.id).toBe(WS);
    const queue = await getStudyQueue(workspace!.id, DATE);
    const elapsed = performance.now() - started;

    const depth = fake.stats.depth();
    const report = {
      latencyMs: LATENCY,
      authNetworkCalls: fake.stats.authCalls,
      dbQueries: fake.stats.queries.length,
      sequentialDbStages: depth,
      simulatedWallMs: Math.round(elapsed),
      stages: Array.from({ length: depth }, (_, i) =>
        fake.stats.queries.filter((q) => q.stage === i + 1).map((q) => q.table)
      ),
    };
    // eslint-disable-next-line no-console
    console.log("[today waterfall]", JSON.stringify(report, null, 2));

    expect(queue.summary.actualMinutesToday).toBe(45);
    // Regression guard: workspace lookup + two parallel query stages.
    expect(fake.stats.authCalls).toBe(0);
    expect(depth).toBeLessThanOrEqual(3);
  });
});
