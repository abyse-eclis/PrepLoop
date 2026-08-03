import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return (
      <EmptyState
        title="ยังไม่มี Workspace"
        description="นำเข้า Workspace Config JSON เพื่อสร้าง Workspace"
        action={
          <Link href="/imports">
            <Button>ไปหน้านำเข้า</Button>
          </Link>
        }
      />
    );
  }

  const supabase = await createServerSupabase();
  const { data: versions } = await supabase
    .from("workspace_config_versions")
    .select("id, version_number, generated_by, created_at")
    .eq("workspace_id", workspace.id)
    .order("version_number", { ascending: false });

  const configVersions =
    (versions as Array<{
      id: string;
      version_number: number;
      generated_by: string;
      created_at: string;
    }> | null) ?? [];

  const current = configVersions.find(
    (v) => v.id === workspace.active_config_version_id
  );

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">
          Workspace: {workspace.name} · timezone {workspace.timezone}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Config เวอร์ชันปัจจุบัน</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">เวลาต่อวัน:</span>{" "}
              {workspace.daily_target_minutes} นาที
            </div>
            <div>
              <span className="text-muted-foreground">Nap:</span>{" "}
              {workspace.nap_target_min}–{workspace.nap_target_max} นาที
            </div>
            <div>
              <span className="text-muted-foreground">เริ่มแผน:</span>{" "}
              {workspace.start_date}
            </div>
            <div>
              <span className="text-muted-foreground">Config เวอร์ชัน:</span>{" "}
              {current ? `v${current.version_number}` : "—"}
            </div>
          </div>
          <div>
            <Link href="/imports">
              <Button variant="outline" size="sm">
                นำเข้า Config เวอร์ชันใหม่
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติ Config (immutable)</CardTitle>
        </CardHeader>
        <CardContent>
          {configVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีเวอร์ชัน</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {configVersions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between"
                >
                  <span>
                    v{v.version_number}{" "}
                    {v.id === workspace.active_config_version_id ? (
                      <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                        ใช้งานอยู่
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(v.created_at, workspace.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
