import type { CourseLesson } from "@/types/db";

export interface CourseProgress {
  doneCount: number;
  totalCount: number;
  percent: number;
}

export function calculateCourseProgress(lessons: CourseLesson[], maxCompletedLesson: string | null | undefined): CourseProgress {
  const totalCount = lessons.length;
  const doneCount = maxCompletedLesson ? lessons.filter((lesson) => lesson.lesson_number <= maxCompletedLesson).length : 0;
  return { doneCount, totalCount, percent: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100) };
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
