import type { PlanItemStatus } from "@/lib/schemas/common";

export const TERMINAL_QUEUE_STATUSES: ReadonlySet<PlanItemStatus> = new Set([
  "completed",
  "cancelled",
]);

/** Legacy imports may contain values that predate the current Zod enum. */
const LEGACY_COMPLETED = new Set(["completed", "complete", "done", "finished"]);
const LEGACY_EXCLUDED = new Set(["cancelled", "canceled", "skipped", "skip"]);

export function isQueueCompleted(status: string | null | undefined): boolean {
  return LEGACY_COMPLETED.has((status ?? "").trim().toLowerCase());
}

export function isQueueExcluded(status: string | null | undefined): boolean {
  return LEGACY_EXCLUDED.has((status ?? "").trim().toLowerCase());
}

export function isQueueActionable(status: string | null | undefined): boolean {
  return !isQueueCompleted(status) && !isQueueExcluded(status);
}

export type QueueState = "ready" | "empty" | "completed" | "inconsistent";

export function classifyQueueState(input: {
  totalItems: number;
  completedItems: number;
  excludedItems: number;
  candidateItems: number;
}): QueueState {
  if (input.totalItems === 0) return "empty";
  if (input.completedItems + input.excludedItems >= input.totalItems)
    return "completed";
  return input.candidateItems > 0 ? "ready" : "inconsistent";
}

/** Queue selection is date-independent: the lowest unfinished position wins. */
export function selectQueueIds(
  items: Array<{ id: string; orderIndex: number; scheduled: boolean }>,
  statuses: ReadonlyMap<string, PlanItemStatus>,
  limit = 8
): string[] {
  return items
    .filter(
      (item) => !item.scheduled && isQueueActionable(statuses.get(item.id))
    )
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
    .map((item) => item.id);
}
