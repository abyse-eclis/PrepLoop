import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { calculateCourseProgress, isYouTubeUrl, isValidHttpUrl } from "@/lib/courses";
import { subjectLabel } from "@/lib/subjects";
import type { Course, CourseLesson } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ q?: string; status?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const workspace = await getActiveWorkspace();
  if (!workspace) return <EmptyState title="ยังไม่มี Workspace" action={<Link href="/imports"><Button>ไปหน้านำเข้า</Button></Link>} />;
  const supabase = await createServerSupabase();
  const { data: courseData } = await supabase.from("courses").select("*").eq("workspace_id", workspace.id).eq("code", decodeURIComponent(code)).maybeSingle();
  const course = courseData as Course | null;
  if (!course) notFound();
  const [{ data: lessonsData }, { data: completed }] = await Promise.all([
    supabase.from("course_lessons").select("id, course_id, external_id, lesson_number, title, section, order_index, lesson_url, source_type").eq("course_id", course.id).order("order_index", { ascending: true }).order("lesson_number", { ascending: true }),
    supabase.from("study_plan_items").select("lesson_to, item_status_overrides!inner(status)").eq("workspace_id", workspace.id).eq("course_code", course.code),
  ]);
  const lessons = (lessonsData as CourseLesson[] | null) ?? [];
  const maxDone = ((completed as Array<{ lesson_to: string | null; item_status_overrides: { status: string } | { status: string }[] }> | null) ?? []).reduce<string | null>((acc, it) => {
    const ov = Array.isArray(it.item_status_overrides) ? it.item_status_overrides[0] : it.item_status_overrides;
    return ov?.status === "completed" && it.lesson_to && (!acc || it.lesson_to > acc) ? it.lesson_to : acc;
  }, null);
  const progress = calculateCourseProgress(lessons, maxDone);
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = sp.status ?? "all";
  const filtered = lessons.filter((l) => {
    const done = maxDone ? l.lesson_number <= maxDone : false;
    const matchesText = !q || `${l.lesson_number} ${l.title} ${l.section ?? ""}`.toLowerCase().includes(q);
    const matchesStatus = status === "done" ? done : status === "todo" ? !done : true;
    return matchesText && matchesStatus;
  });
  const sections = new Map<string, CourseLesson[]>();
  for (const lesson of filtered) sections.set(lesson.section ?? "ไม่ระบุหมวด", [...(sections.get(lesson.section ?? "ไม่ระบุหมวด") ?? []), lesson]);
  const queryFor = (next: Record<string, string>) => `/courses/${encodeURIComponent(course.code)}?${new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}), ...next }).toString()}`;

  return <div className="flex flex-col gap-6"><header className="flex flex-col gap-2"><Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">← กลับหน้าคอร์ส</Link><h1 className="text-xl font-bold">{course.code} · {course.name}</h1><p className="text-sm text-muted-foreground">{subjectLabel(course.subject)} · เรียนแล้ว {progress.doneCount}/{progress.totalCount} บท ({progress.percent}%)</p><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress.percent}%` }} /></div></header>
    <Card><CardContent className="pt-4"><form className="flex flex-wrap gap-2"><input name="q" defaultValue={sp.q ?? ""} placeholder="ค้นหาบทเรียน" className="min-w-56 rounded-md border border-input bg-background px-3 py-2" /><Button type="submit" variant="secondary">ค้นหา</Button><Link className="rounded-md border px-3 py-2 text-sm" href={queryFor({ status: "all" })}>ทั้งหมด</Link><Link className="rounded-md border px-3 py-2 text-sm" href={queryFor({ status: "done" })}>เรียนแล้ว</Link><Link className="rounded-md border px-3 py-2 text-sm" href={queryFor({ status: "todo" })}>ยังไม่เรียน</Link></form></CardContent></Card>
    {Array.from(sections.entries()).map(([section, items]) => <Card key={section}><CardHeader><CardTitle className="text-lg">{section} ({items.length})</CardTitle></CardHeader><CardContent className="grid gap-2">{items.map((l) => { const done = maxDone ? l.lesson_number <= maxDone : false; const hasUrl = isValidHttpUrl(l.lesson_url); return <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={done ? "h-2.5 w-2.5 rounded-full bg-primary" : "h-2.5 w-2.5 rounded-full bg-muted"} /><span className="text-sm text-muted-foreground">{l.lesson_number}</span><span className="text-base font-medium">{l.title}</span></div><div className="ml-5 text-sm text-muted-foreground">{done ? "เรียนแล้ว" : "ยังไม่เรียน"}{l.source_type ? ` · ${l.source_type}` : ""}</div></div>{hasUrl ? <a href={l.lesson_url!} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline">{isYouTubeUrl(l.lesson_url) ? "เปิดวิดีโอ YouTube" : "เปิดบทเรียน"}</Button></a> : null}</div>})}</CardContent></Card>)}
  </div>;
}
