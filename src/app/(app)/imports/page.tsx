import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { ImportPanel } from "@/features/imports/import-panel";
import { Uploader } from "@/features/imports/uploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IMPORT_TYPE_LABELS, type ImportType } from "@/lib/schemas";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const workspace = await getActiveWorkspace();

  let history: Array<{
    id: string;
    import_type: string;
    summary: Record<string, number>;
    created_at: string;
  }> = [];
  let files: Array<{ id: string; title: string; file_type: string }> = [];

  if (workspace) {
    const supabase = await createServerSupabase();
    const [{ data: h }, { data: f }] = await Promise.all([
      supabase
        .from("import_history")
        .select("id, import_type, summary, created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("source_files")
        .select("id, title, file_type")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    history = (h as typeof history) ?? [];
    files = (f as typeof files) ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">นำเข้าข้อมูล</h1>
        <p className="text-sm text-muted-foreground">
          {workspace
            ? "นำเข้า JSON (Workspace / Learning Source / Study Plan) และอัปโหลดไฟล์แหล่งเรียน"
            : "เริ่มต้นด้วยการนำเข้า Workspace Config JSON เพื่อสร้าง Workspace"}
        </p>
      </header>

      <ImportPanel />

      {workspace ? <Uploader /> : null}

      {workspace ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>ประวัติการนำเข้า</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {IMPORT_TYPE_LABELS[h.import_type as ImportType] ??
                            h.import_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(h.created_at, workspace.timezone)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Object.entries(h.summary)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ไฟล์แหล่งเรียน ({files.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีไฟล์</p>
              ) : (
                <ul className="space-y-1.5">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate">{f.title}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {f.file_type.split("/")[1] ?? f.file_type}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
