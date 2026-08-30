import type { PlanItemStatus } from "@/lib/schemas/common";

export const TERMINAL_QUEUE_STATUSES: ReadonlySet<PlanItemStatus> = new Set([
  "completed",
  "cancelled",
]);

/** Queue selection is date-independent: the lowest unfinished position wins. */
export function selectQueueIds(
  items: Array<{ id: string; orderIndex: number; scheduled: boolean }>,
  statuses: ReadonlyMap<string, PlanItemStatus>,
  limit = 8
): string[] {
  return items
    .filter((item) => !item.scheduled && !TERMINAL_QUEUE_STATUSES.has(statuses.get(item.id) ?? "not_started"))
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
    .map((item) => item.id);
}
