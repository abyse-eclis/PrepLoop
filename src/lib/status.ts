import type { PlanItemStatus } from "@/lib/schemas/common";

export const STATUS_LABELS: Record<PlanItemStatus, string> = {
  not_started: "ยังไม่เริ่ม",
  studying: "กำลังเรียน",
  paused: "พัก",
  completed: "เรียนเสร็จ",
  incomplete: "ทำไม่ครบ",
  needs_review: "ต้องทบทวน",
  recovery: "Recovery",
  cancelled: "ยกเลิกตามแผนใหม่",
};

export const STATUS_CLASS: Record<PlanItemStatus, string> = {
  not_started: "status-not_started",
  studying: "status-studying",
  paused: "status-paused",
  completed: "status-completed",
  incomplete: "status-incomplete",
  needs_review: "status-needs_review",
  recovery: "status-recovery",
  cancelled: "status-cancelled",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  course: "คอร์ส",
  review: "ทบทวน",
  diagnostic: "Diagnostic",
  quiz: "Quiz",
  exercise: "แบบฝึกหัด",
  mock: "Mock",
  rest: "พัก",
  other: "อื่น ๆ",
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? type;
}
