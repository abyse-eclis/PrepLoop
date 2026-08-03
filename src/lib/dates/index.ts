/**
 * Central date/time utilities.
 *
 * Rules:
 * - Timestamps are stored in UTC (ISO strings).
 * - Display uses the workspace timezone (default Asia/Bangkok).
 * - Internal date keys are ISO date strings (YYYY-MM-DD).
 * - Buddhist Era (พ.ศ.) is a display-only concern.
 */

export const DEFAULT_TIMEZONE = "Asia/Bangkok";

/** Regex for HH:MM (24h) time strings. */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Regex for YYYY-MM-DD date strings. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Convert an HH:MM string into minutes since midnight. */
export function timeToMinutes(time: string): number {
  if (!isValidTimeString(time)) {
    throw new Error(`รูปแบบเวลาไม่ถูกต้อง: "${time}" (ต้องเป็น HH:MM)`);
  }
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

/**
 * Compute duration in minutes between two HH:MM times on the same day.
 * end must be strictly after start (no cross-midnight support here).
 */
export function durationMinutes(start: string, end: string): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (e <= s) {
    throw new Error(`เวลาสิ้นสุด (${end}) ต้องอยู่หลังเวลาเริ่ม (${start})`);
  }
  return e - s;
}

export interface TimeInterval {
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface IntervalValidationResult {
  ok: boolean;
  totalMinutes: number;
  errors: string[];
}

/**
 * Validate a set of intervals and compute total minutes.
 * Detects invalid times, end<=start, and overlaps.
 */
export function validateIntervals(
  intervals: TimeInterval[]
): IntervalValidationResult {
  const errors: string[] = [];
  if (intervals.length === 0) {
    return { ok: false, totalMinutes: 0, errors: ["ต้องมีอย่างน้อยหนึ่งช่วงเวลา"] };
  }

  const ranges: Array<{ start: number; end: number; raw: TimeInterval }> = [];
  for (const iv of intervals) {
    if (!isValidTimeString(iv.start) || !isValidTimeString(iv.end)) {
      errors.push(`รูปแบบเวลาไม่ถูกต้อง: ${iv.start}–${iv.end}`);
      continue;
    }
    const s = timeToMinutes(iv.start);
    const e = timeToMinutes(iv.end);
    if (e <= s) {
      errors.push(`เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม: ${iv.start}–${iv.end}`);
      continue;
    }
    ranges.push({ start: s, end: e, raw: iv });
  }

  // Overlap detection
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.start < prev.end) {
      errors.push(
        `ช่วงเวลาซ้อนกัน: ${prev.raw.start}–${prev.raw.end} และ ${cur.raw.start}–${cur.raw.end}`
      );
    }
  }

  const totalMinutes = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  return { ok: errors.length === 0, totalMinutes, errors };
}

/**
 * Get the current date key (YYYY-MM-DD) for a given timezone.
 */
export function todayInTimezone(
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): string {
  return dateKeyInTimezone(now, timezone);
}

/**
 * Convert a Date (instant) into a YYYY-MM-DD key as seen in a timezone.
 */
export function dateKeyInTimezone(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA yields YYYY-MM-DD
  return fmt.format(date);
}

/**
 * Format an ISO timestamp for display in a timezone.
 */
export function formatDateTime(
  iso: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Add days to an ISO date key, returning a new ISO date key. */
export function addDays(dateKey: string, days: number): string {
  if (!isValidDateString(dateKey)) {
    throw new Error(`รูปแบบวันที่ไม่ถูกต้อง: ${dateKey}`);
  }
  const [y, m, d] = dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Inclusive difference in days between two date keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(...(a.split("-").map(Number) as [number, number, number]));
  const db = Date.UTC(...(b.split("-").map(Number) as [number, number, number]));
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/** Return the Monday-based ISO week key (YYYY-Www) for a date key. */
export function isoWeekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = date.getUTCDay() || 7; // 1..7, Monday=1
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Return the month key (YYYY-MM) for a date key. */
export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Convert a Gregorian year to Buddhist Era for display. */
export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}

/**
 * Format a date key for Thai display, optionally with พ.ศ.
 */
export function formatDateKeyThai(
  dateKey: string,
  opts: { buddhist?: boolean } = {}
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const year = opts.buddhist ? toBuddhistYear(y!) : y!;
  return `${d} ${months[m! - 1]} ${year}`;
}
