import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getStudyQueue } from "@/features/today/data";
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
  const queue = await getStudyQueue(workspace.id, today);

  return (
    <TodayView
      workspace={workspace}
      date={today}
      queue={queue}
    />
  );
}
