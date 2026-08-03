import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getItemsForDate } from "@/features/plans/data";
import { createServerSupabase } from "@/lib/supabase/server";
import { todayInTimezone } from "@/lib/dates";
import { TodayView } from "@/features/today/today-view";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return (
      <EmptyState
        title="ยังไม่มี Workspace"
        description="เริ่มต้นด้วยการนำเข้า Workspace Config JSON เพื่อสร้างพื้นที่ทำงานของคุณ"
        action={
          <Link href="/imports">
            <Button>ไปหน้านำเข้า</Button>
          </Link>
        }
      />
    );
  }

  const today = todayInTimezone(workspace.timezone);
  const { version, items } = await getItemsForDate(workspace.id, today);

  // Nap actual: sum of sessions with subject 'nap' isn't tracked separately in MVP.
  const supabase = await createServerSupabase();
  const { count: dueReviews } = await supabase
    .from("review_tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("status", "pending")
    .lte("due_date", today);

  return (
    <TodayView
      workspace={workspace}
      date={today}
      version={version}
      items={items}
      dueReviewCount={dueReviews ?? 0}
    />
  );
}
