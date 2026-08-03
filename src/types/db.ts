import type { PlanItemStatus } from "@/lib/schemas/common";

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  timezone: string;
  start_date: string;
  daily_target_minutes: number;
  nap_target_min: number;
  nap_target_max: number;
  active_config_version_id: string | null;
  active_plan_version_id: string | null;
  active_catalog_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanVersion {
  id: string;
  workspace_id: string;
  parent_version_id: string | null;
  version_number: number;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: "draft" | "active" | "superseded" | "archived";
  generated_by: string;
  change_reason: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  activated_at: string | null;
  archived_at: string | null;
}

export interface PlanItem {
  id: string;
  workspace_id: string;
  plan_version_id: string;
  plan_day_id: string;
  date: string;
  stable_external_id: string;
  subject: string;
  course_code: string | null;
  lesson_from: string | null;
  lesson_to: string | null;
  activity_type: string;
  assessment_source_id: string | null;
  target_minutes: number;
  priority: "high" | "medium" | "low";
  instructions: string | null;
  review_reference_ids: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PlanDay {
  id: string;
  workspace_id: string;
  plan_version_id: string;
  date: string;
  target_minutes: number;
  nap_target_minutes: number;
  notes: string | null;
}

export interface ItemStatusOverride {
  id: string;
  plan_item_id: string;
  status: PlanItemStatus;
  actual_lesson_from: string | null;
  actual_lesson_to: string | null;
}

export interface StudySession {
  id: string;
  workspace_id: string;
  plan_item_id: string | null;
  subject: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  status: "studying" | "paused" | "completed" | "interrupted";
  actual_lesson_from: string | null;
  actual_lesson_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssessmentSource {
  id: string;
  workspace_id: string;
  external_id: string;
  type: string;
  subject: string;
  title: string;
  course_code: string | null;
  lesson_from: string | null;
  lesson_to: string | null;
  source_type: string;
  source_file_id: string | null;
  question_page_from: number | null;
  question_page_to: number | null;
  answer_page_from: number | null;
  answer_page_to: number | null;
  solution_page_from: number | null;
  solution_page_to: number | null;
  covered_topics: string[] | null;
  required_completed_lessons: string[] | null;
  passing_percentage: number;
  notes: string | null;
}

export interface AssessmentAttempt {
  id: string;
  workspace_id: string;
  assessment_source_id: string | null;
  plan_item_id: string | null;
  subject: string | null;
  attempt_date: string;
  score: number;
  max_score: number;
  total_questions: number | null;
  correct: number | null;
  incorrect: number | null;
  skipped: number | null;
  guessed: number | null;
  duration_minutes: number | null;
  passing_percentage: number;
  percentage: number | null;
  passed: boolean | null;
  completed_on_time: boolean | null;
  notes: string | null;
  created_at: string;
}

export interface ReviewTask {
  id: string;
  workspace_id: string;
  source_type: string;
  source_ref: string | null;
  subject: string | null;
  course_code: string | null;
  lesson_from: string | null;
  lesson_to: string | null;
  rule: string;
  due_date: string;
  reason: string | null;
  instructions: string[] | null;
  status: "pending" | "done" | "skipped";
  result: string | null;
  next_review_date: string | null;
}

export interface Course {
  id: string;
  workspace_id: string;
  external_id: string;
  code: string;
  name: string;
  subject: string;
  total_lessons: number | null;
}

export interface CourseLesson {
  id: string;
  course_id: string;
  external_id: string;
  lesson_number: string;
  title: string;
  section: string | null;
  order_index: number | null;
}

export interface SourceFile {
  id: string;
  workspace_id: string;
  external_id: string | null;
  title: string;
  file_type: string;
  storage_path: string | null;
  size_bytes: number | null;
}
