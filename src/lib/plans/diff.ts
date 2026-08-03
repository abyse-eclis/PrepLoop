import type { PlanItemInput, StudyPlan } from "@/lib/schemas/study-plan";

export interface PlanItemRef {
  date: string;
  item: PlanItemInput;
}

export interface PlanDiffEntry {
  type: "added" | "removed" | "moved" | "changed";
  stableExternalId: string;
  description: string;
}

function indexItems(plan: {
  days: Array<{ date: string; items: PlanItemInput[] }>;
}): Map<string, PlanItemRef> {
  const map = new Map<string, PlanItemRef>();
  for (const day of plan.days) {
    for (const item of day.items) {
      map.set(item.stableExternalId, { date: day.date, item });
    }
  }
  return map;
}

/**
 * Produce a text-based diff between two plan versions.
 * Not a visual diff — a list of add / remove / move / change entries.
 */
export function diffPlans(
  oldPlan: { days: Array<{ date: string; items: PlanItemInput[] }> },
  newPlan: { days: Array<{ date: string; items: PlanItemInput[] }> }
): PlanDiffEntry[] {
  const oldMap = indexItems(oldPlan);
  const newMap = indexItems(newPlan);
  const entries: PlanDiffEntry[] = [];

  for (const [id, oldRef] of oldMap) {
    const newRef = newMap.get(id);
    if (!newRef) {
      entries.push({
        type: "removed",
        stableExternalId: id,
        description: `ลบรายการ ${describe(oldRef.item)} (${oldRef.date})`,
      });
      continue;
    }
    if (newRef.date !== oldRef.date) {
      entries.push({
        type: "moved",
        stableExternalId: id,
        description: `ย้าย ${describe(oldRef.item)} จาก ${oldRef.date} → ${newRef.date}`,
      });
    }
    const changes = fieldChanges(oldRef.item, newRef.item);
    if (changes.length > 0) {
      entries.push({
        type: "changed",
        stableExternalId: id,
        description: `แก้ไข ${describe(newRef.item)}: ${changes.join(", ")}`,
      });
    }
  }

  for (const [id, newRef] of newMap) {
    if (!oldMap.has(id)) {
      entries.push({
        type: "added",
        stableExternalId: id,
        description: `เพิ่มรายการ ${describe(newRef.item)} (${newRef.date})`,
      });
    }
  }

  return entries;
}

function describe(item: PlanItemInput): string {
  const parts = [item.subject];
  if (item.courseCode) parts.push(item.courseCode);
  parts.push(`[${item.activityType}]`);
  return parts.join(" ");
}

function fieldChanges(a: PlanItemInput, b: PlanItemInput): string[] {
  const out: string[] = [];
  if (a.targetMinutes !== b.targetMinutes) {
    out.push(`เวลาเป้าหมาย ${a.targetMinutes}→${b.targetMinutes} นาที`);
  }
  if (a.priority !== b.priority) {
    out.push(`ความสำคัญ ${a.priority}→${b.priority}`);
  }
  if (a.activityType !== b.activityType) {
    out.push(`ประเภท ${a.activityType}→${b.activityType}`);
  }
  return out;
}

export function summarizeDiff(entries: PlanDiffEntry[]): {
  added: number;
  removed: number;
  moved: number;
  changed: number;
} {
  return {
    added: entries.filter((e) => e.type === "added").length,
    removed: entries.filter((e) => e.type === "removed").length,
    moved: entries.filter((e) => e.type === "moved").length,
    changed: entries.filter((e) => e.type === "changed").length,
  };
}

export type { StudyPlan };
