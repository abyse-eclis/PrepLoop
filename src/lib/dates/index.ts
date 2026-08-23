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

/** Alias for timeToMinutes — the canonical parser. Never uses locale/Date. */
export function parseTimeToMinutes(time: string): number {
  return timeToMinutes(time);
}

/** Format minutes-since-midnight as 24h HH:mm (wraps past 24h for display). */
export function formatMinutesToTime(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A single interval crossing midnight can be at most this long (16h). */
export const MAX_SESSION_MINUTES = 16 * 60;

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
  start: string; // HH:MM (24h)
  end: string; // HH:MM (24h)
}

export interface IntervalDetail {
  start: string;
  end: string;
  minutes: number;
  crossesMidnight: boolean;
}

export interface IntervalValidationResult {
  ok: boolean;
  totalMinutes: number;
  errors: string[];
  details: IntervalDetail[];
}

/**
 * Validate a set of 24h HH:MM intervals and compute total minutes.
 *
 * Cross-midnight support: if end <= start, the interval is interpreted as
 * ending the NEXT day (e.g. 23:38–00:50 = 72 min), as long as the resulting
 * duration does not exceed MAX_SESSION_MINUTES (16h) — beyond that it is far
 * more likely a mistake than a real overnight session, so it is rejected with a
 * clear message instead of silently spanning ~a full day.
 *
 * Overlaps are detected on ABSOLUTE minute ranges (cross-midnight intervals use
 * end + 1440), so touching endpoints (23:30–00:30 then 00:30–01:00) do NOT
 * count as overlaps. Each distinct problem is reported exactly once.
 */
export function validateIntervals(
  intervals: TimeInterval[]
): IntervalValidationResult {
  const errorSet = new Set<string>();
  if (intervals.length === 0) {
    return {
      ok: false,
      totalMinutes: 0,
      errors: ["ต้องมีอย่างน้อยหนึ่งช่วงเวลา"],
      details: [],
    };
  }

  const ranges: Array<{ start: number; end: number; raw: TimeInterval }> = [];
  const details: IntervalDetail[] = [];

  for (const iv of intervals) {
    if (!isValidTimeString(iv.start) || !isValidTimeString(iv.end)) {
      errorSet.add(`รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM 24 ชม.): ${iv.start || "?"}–${iv.end || "?"}`);
      continue;
    }
    const s = timeToMinutes(iv.start);
    let e = timeToMinutes(iv.end);
    let crossesMidnight = false;

    if (e === s) {
      errorSet.add(`เวลาเริ่มและสิ้นสุดต้องไม่เท่ากัน: ${iv.start}–${iv.end}`);
      continue;
    }
    if (e < s) {
      // Candidate cross-midnight interpretation.
      const overnight = e + 1440;
      if (overnight - s > MAX_SESSION_MINUTES) {
        errorSet.add(
          `เวลาสิ้นสุด (${iv.end}) ต้องอยู่หลังเวลาเริ่ม (${iv.start}) — หากตั้งใจเรียนข้ามคืน ช่วงต้องไม่เกิน ${MAX_SESSION_MINUTES / 60} ชม.`
        );
        continue;
      }
      e = overnight;
      crossesMidnight = true;
    }

    ranges.push({ start: s, end: e, raw: iv });
    details.push({
      start: iv.start,
      end: iv.end,
      minutes: e - s,
      crossesMidnight,
    });
  }

  // Overlap + duplicate detection on absolute minute ranges (sorted by start).
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.start === cur.start && prev.end === cur.end) {
      errorSet.add(`มีช่วงเวลาซ้ำกัน: ${cur.raw.start}–${cur.raw.end}`);
      continue;
    }
    // Touching endpoints (cur.start === prev.end) are allowed.
    if (cur.start < prev.end) {
      errorSet.add(
        `ช่วงเวลาซ้อนกัน: ${prev.raw.start}–${prev.raw.end} และ ${cur.raw.start}–${cur.raw.end}`
      );
    }
  }

  const totalMinutes = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  return {
    ok: errorSet.size === 0,
    totalMinutes,
    errors: Array.from(errorSet),
    details,
  };
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

/** Monday..Sunday bounds of the ISO week containing a date key. */
export function weekBounds(dateKey: string): { start: string; end: string } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = date.getUTCDay() || 7; // 1..7, Monday=1
  const monday = addDays(dateKey, -(day - 1));
  return { start: monday, end: addDays(monday, 6) };
}

/** First..last day bounds of the calendar month containing a date key. */
export function monthBounds(dateKey: string): { start: string; end: string } {
  const [y, m] = dateKey.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const end = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    lastDay
  ).padStart(2, "0")}`;
  return { start, end };
}

/** Every date key from start to end, inclusive. */
export function dateRange(start: string, end: string): string[] {
  if (!isValidDateString(start) || !isValidDateString(end)) {
    throw new Error(`ช่วงวันที่ไม่ถูกต้อง: ${start} → ${end}`);
  }
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
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
