import { addDays, isoWeekKey, monthKey } from "@/lib/dates";
import type { ReviewRule } from "@/lib/schemas/common";

export const REVIEW_RULE_LABELS: Record<ReviewRule, string> = {
  same_day: "วันนี้",
  next_day: "พรุ่งนี้ (1 วัน)",
  three_days: "3 วัน",
  seven_days: "7 วัน",
  weekly: "ปลายสัปดาห์",
  monthly: "ปลายเดือน",
};

/**
 * Compute the due date (YYYY-MM-DD) for a review rule relative to a base date.
 */
export function reviewDueDate(rule: ReviewRule, baseDate: string): string {
  switch (rule) {
    case "same_day":
      return baseDate;
    case "next_day":
      return addDays(baseDate, 1);
    case "three_days":
      return addDays(baseDate, 3);
    case "seven_days":
      return addDays(baseDate, 7);
    case "weekly":
      return endOfIsoWeek(baseDate);
    case "monthly":
      return endOfMonth(baseDate);
  }
}

function endOfIsoWeek(dateKey: string): string {
  // Move forward until Sunday (ISO week end).
  let cursor = dateKey;
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = cursor.split("-").map(Number);
    const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Sun
    if (day === 0) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function endOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    last
  ).padStart(2, "0")}`;
}

/** Default detailed review instructions (Thai). */
export const DEFAULT_REVIEW_INSTRUCTIONS = [
  "ปิดโน้ตแล้วสรุปหลักคิดจากความจำ",
  "ทำข้อที่เคยผิดใหม่",
  "ทำโจทย์รูปแบบเดียวกันเพิ่ม",
  "อธิบายวิธีคิดด้วยคำของตัวเอง",
  "บันทึกว่าทำได้เอง เปิดสูตร หรือยังทำไม่ได้",
];

/**
 * Given a completion/assessment event, produce the set of review tasks to
 * schedule. For MVP we schedule a small spaced-repetition ladder.
 */
export function reviewRulesForEvent(
  eventType: "lesson_completed" | "assessment_recorded"
): ReviewRule[] {
  if (eventType === "assessment_recorded") {
    return ["next_day", "three_days", "seven_days"];
  }
  return ["same_day", "three_days", "seven_days"];
}

export function reviewBucket(
  dueDate: string,
  today: string
): "overdue" | "today" | "upcoming" {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

export { isoWeekKey, monthKey };
