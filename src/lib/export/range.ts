/**
 * Export range resolution — pure, so the UI, the API route and the tests all
 * agree on what "รายสัปดาห์" or "ทั้งหมด" means for a given day.
 */

import {
  isValidDateString,
  monthBounds,
  weekBounds,
  formatDateKeyThai,
} from "@/lib/dates";

export const EXPORT_RANGE_KINDS = [
  "daily",
  "weekly",
  "monthly",
  "custom",
  "all",
] as const;
export type ExportRangeKind = (typeof EXPORT_RANGE_KINDS)[number];

export const EXPORT_RANGE_LABELS: Record<ExportRangeKind, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  custom: "กำหนดเอง",
  all: "ทั้งหมด",
};

export interface ResolvedExportRange {
  kind: ExportRangeKind;
  start: string;
  end: string;
  /** Human label for the file header, e.g. "รายสัปดาห์ · 17 – 23 ส.ค. 2569". */
  label: string;
}

export type ExportRangeResult =
  | { ok: true; range: ResolvedExportRange }
  | { ok: false; error: string };

export function isExportRangeKind(value: unknown): value is ExportRangeKind {
  return EXPORT_RANGE_KINDS.includes(value as ExportRangeKind);
}

function describe(kind: ExportRangeKind, start: string, end: string): string {
  const base = EXPORT_RANGE_LABELS[kind];
  const from = formatDateKeyThai(start, { buddhist: true });
  if (start === end) return `${base} · ${from}`;
  return `${base} · ${from} – ${formatDateKeyThai(end, { buddhist: true })}`;
}

/**
 * Turn a range kind into concrete inclusive bounds.
 *
 * `custom` needs both dates from the caller. `all` needs the earliest and
 * latest dates that actually hold data — only the server knows those, so they
 * are passed in rather than guessed.
 */
export function resolveExportRange(input: {
  kind: ExportRangeKind;
  today: string;
  start?: string | null;
  end?: string | null;
  earliest?: string | null;
  latest?: string | null;
}): ExportRangeResult {
  const { kind, today } = input;
  if (!isValidDateString(today)) {
    return { ok: false, error: `วันที่อ้างอิงไม่ถูกต้อง: ${today}` };
  }

  if (kind === "daily") {
    return { ok: true, range: { kind, start: today, end: today, label: describe(kind, today, today) } };
  }

  if (kind === "weekly" || kind === "monthly") {
    const { start, end } =
      kind === "weekly" ? weekBounds(today) : monthBounds(today);
    return { ok: true, range: { kind, start, end, label: describe(kind, start, end) } };
  }

  if (kind === "custom") {
    const start = input.start ?? "";
    const end = input.end ?? "";
    if (!isValidDateString(start) || !isValidDateString(end)) {
      return { ok: false, error: "กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุดให้ครบ" };
    }
    if (start > end) {
      return { ok: false, error: "วันที่เริ่มต้องไม่อยู่หลังวันที่สิ้นสุด" };
    }
    return { ok: true, range: { kind, start, end, label: describe(kind, start, end) } };
  }

  // all — everything the workspace has, falling back to today when it is empty.
  const earliest =
    input.earliest && isValidDateString(input.earliest) ? input.earliest : null;
  const latest =
    input.latest && isValidDateString(input.latest) ? input.latest : null;
  const start = earliest ?? today;
  const rawEnd = latest ?? today;
  const end = rawEnd < start ? start : rawEnd;
  return { ok: true, range: { kind, start, end, label: describe(kind, start, end) } };
}
