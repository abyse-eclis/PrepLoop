import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { todayInTimezone, addDays } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ReviewItem } from "@/features/reviews/review-item";
import type { ReviewTask } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return (
      <EmptyState
        title="ยังไม่มี Workspace"
        action={
          <Link href="/imports">
            <Button>ไปหน้านำเข้า</Button>
          </Link>
        }
      />
    );
  }

  const today = todayInTimezone(workspace.timezone);
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("review_tasks")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("due_date", { ascending: true });
  const reviews = (data as ReviewTask[] | null) ?? [];

  const pending = reviews.filter((r) => r.status === "pending");
  const buckets: Array<{ key: string; label: string; items: ReviewTask[] }> = [
    { key: "overdue", label: "เกินกำหนด", items: pending.filter((r) => r.due_date < today) },
    { key: "today", label: "วันนี้", items: pending.filter((r) => r.due_date === today) },
    {
      key: "1d",
      label: "พรุ่งนี้ (1 วัน)",
      items: pending.filter((r) => r.due_date === addDays(today, 1)),
    },
    {
      key: "3d",
      label: "ภายใน 3 วัน",
      items: pending.filter(
        (r) => r.due_date > addDays(today, 1) && r.due_date <= addDays(today, 3)
      ),
    },
    {
      key: "7d",
      label: "ภายใน 7 วัน",
      items: pending.filter(
        (r) => r.due_date > addDays(today, 3) && r.due_date <= addDays(today, 7)
      ),
    },
    {
      key: "later",
      label: "หลังจากนั้น (ปลายสัปดาห์/เดือน)",
      items: pending.filter((r) => r.due_date > addDays(today, 7)),
    },
  ];

  const done = reviews.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">งานทบทวน</h1>
        <p className="text-sm text-muted-foreground">
          ทบทวนตามรอบ spaced repetition และบันทึกผล
        </p>
      </header>

      {pending.length === 0 ? (
        <EmptyState
          title="ไม่มีงานทบทวนที่ค้าง"
          description="งานทบทวนจะถูกสร้างอัตโนมัติเมื่อเรียนเสร็จหรือบันทึกผลข้อสอบ"
        />
      ) : (
        buckets
          .filter((b) => b.items.length > 0)
          .map((b) => (
            <Card key={b.key}>
              <CardHeader>
                <CardTitle>
                  {b.label} ({b.items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {b.items.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </CardContent>
            </Card>
          ))
      )}

      {done.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>ทบทวนแล้วล่าสุด</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {done.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
