/**
 * Pure plan-version selection.
 *
 * Immutable history: every date keeps pointing at the version that was in
 * effect on that date, even after a recovery plan supersedes it. Carry-over
 * needs this per past date (not just today), so the rule lives here as a pure
 * function instead of being buried in a database query.
 */

export interface SelectableVersion {
  status: string;
  start_date: string;
  end_date: string;
  effective_from: string | null;
  effective_to: string | null;
  version_number: number;
}

/** Versions that can own a date. `archived` never does. */
const SELECTABLE_STATUSES = new Set(["active", "superseded", "draft"]);

/**
 * Pick the version effective on `date`, or null when no version covers it.
 * Non-draft versions win; a draft is only used when nothing else covers the
 * date. Ties break on the latest effective_from, then the highest version.
 */
export function selectVersionForDate<T extends SelectableVersion>(
  versions: T[],
  date: string
): T | null {
  const covering = versions
    .filter((v) => SELECTABLE_STATUSES.has(v.status))
    .filter((v) => v.start_date <= date && v.end_date >= date)
    .sort((a, b) => b.version_number - a.version_number);

  const effective = covering
    .filter((v) => v.status !== "draft")
    .filter((v) => {
      const from = v.effective_from ?? v.start_date;
      const to = v.effective_to ?? v.end_date;
      return from <= date && to >= date;
    })
    .sort((a, b) => {
      const fromCmp = (b.effective_from ?? b.start_date).localeCompare(
        a.effective_from ?? a.start_date
      );
      return fromCmp || b.version_number - a.version_number;
    });

  return effective[0] ?? covering.find((v) => v.status === "draft") ?? null;
}

/**
 * Map each date to the id of the version that owns it, so plan items from
 * superseded versions can be filtered out in one pass.
 */
export function versionIdsByDate<T extends SelectableVersion & { id: string }>(
  versions: T[],
  dates: string[]
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const date of dates) {
    if (map.has(date)) continue;
    map.set(date, selectVersionForDate(versions, date)?.id ?? null);
  }
  return map;
}
