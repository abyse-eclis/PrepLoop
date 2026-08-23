/**
 * Carry-over ("เรียนย้อนหลัง") — plan items whose planned date has passed but
 * that are not finished yet. They stay in the queue on later days so an
 * unfinished yesterday is visible today, grouped by the day they came from.
 *
 * Pure functions only: the caller supplies already-resolved rows.
 */

import { daysBetween } from "@/lib/dates";
import type { ExecutionState } from "@/lib/study-execution";

/** How far back the Today page looks for unfinished work. */
export const CARRY_OVER_LOOKBACK_DAYS = 30;

/** Execution states that are never carried over. */
const SETTLED_STATES = new Set<ExecutionState>([
  "completed_on_time",
  "completed_early",
  "completed_late",
  "cancelled",
]);

export interface CarryOverCandidate {
  plannedDate: string;
  targetMinutes: number;
  actualMinutes: number;
  executionState: ExecutionState;
}

export interface CarryOverEntry<T> {
  row: T;
  /** Whole days between the planned date and today (>= 1 for real carry-over). */
  daysLate: number;
  /** Target minutes still owed on this item. */
  remainingMinutes: number;
}

export interface CarryOverGroup<T> {
  date: string;
  daysLate: number;
  remainingMinutes: number;
  entries: CarryOverEntry<T>[];
}

export interface CarryOverSummary<T> {
  /** Oldest planned date first, so the biggest debt is handled first. */
  groups: CarryOverGroup<T>[];
  entries: CarryOverEntry<T>[];
  itemCount: number;
  remainingMinutes: number;
  oldestDate: string | null;
  maxDaysLate: number;
}

/** An item is carried over while it is neither finished nor cancelled. */
export function isCarriedOver(
  state: ExecutionState,
  plannedDate: string,
  today: string
): boolean {
  if (SETTLED_STATES.has(state)) return false;
  return plannedDate < today;
}

/** Target minutes still owed — never negative, even when the item ran over. */
export function remainingMinutes(
  targetMinutes: number,
  actualMinutes: number
): number {
  return Math.max(0, Math.max(0, targetMinutes) - Math.max(0, actualMinutes));
}

export function daysLate(plannedDate: string, today: string): number {
  return Math.max(0, daysBetween(plannedDate, today));
}

/** Thai label for how stale a carried-over day is. */
export function carryOverDayLabel(late: number): string {
  if (late <= 0) return "ค้างของวันนี้";
  if (late === 1) return "ค้างจากเมื่อวาน";
  if (late === 2) return "ค้างจากเมื่อวานซืน";
  return `ค้างมาแล้ว ${late} วัน`;
}

/**
 * Group unfinished past items by their planned date.
 *
 * `read` maps a caller row onto the fields this module needs, so the queue
 * types stay in the feature layer and this file stays testable with plain
 * objects.
 */
export function buildCarryOver<T>(
  rows: T[],
  today: string,
  read: (row: T) => CarryOverCandidate
): CarryOverSummary<T> {
  const byDate = new Map<string, CarryOverGroup<T>>();
  const entries: CarryOverEntry<T>[] = [];

  for (const row of rows) {
    const data = read(row);
    if (!isCarriedOver(data.executionState, data.plannedDate, today)) continue;

    const entry: CarryOverEntry<T> = {
      row,
      daysLate: daysLate(data.plannedDate, today),
      remainingMinutes: remainingMinutes(data.targetMinutes, data.actualMinutes),
    };
    entries.push(entry);

    const group = byDate.get(data.plannedDate) ?? {
      date: data.plannedDate,
      daysLate: entry.daysLate,
      remainingMinutes: 0,
      entries: [],
    };
    group.entries.push(entry);
    group.remainingMinutes += entry.remainingMinutes;
    byDate.set(data.plannedDate, group);
  }

  const groups = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    groups,
    entries,
    itemCount: entries.length,
    remainingMinutes: entries.reduce((sum, e) => sum + e.remainingMinutes, 0),
    oldestDate: groups[0]?.date ?? null,
    maxDaysLate: groups[0]?.daysLate ?? 0,
  };
}
