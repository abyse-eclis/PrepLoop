import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { ImportPanel } from "@/features/imports/import-panel";
import { Uploader } from "@/features/imports/uploader";
import { FileList, type SourceFileRow } from "@/features/imports/file-list";
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
  let files: SourceFileRow[] = [];

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
        .select(
          "id, external_id, display_name, title, original_file_name, mime_type, file_type, size_bytes, storage_path, created_at"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    history = (h as typeof history) ?? [];
    files = (
      (f as Array<{
        id: string;
        external_id: string | null;
        display_name: string | null;
        title: string | null;
        original_file_name: string | null;
        mime_type: string | null;
        file_type: string | null;
        size_bytes: number | null;
        storage_path: string | null;
        created_at: string;
      }> | null) ?? []
    ).map((row) => ({
      id: row.id,
      displayName: row.display_name ?? row.title ?? row.original_file_name ?? "(ไม่มีชื่อ)",
      originalFileName: row.original_file_name ?? row.title ?? "",
      mimeType: row.mime_type ?? row.file_type ?? "application/octet-stream",
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      kind: row.storage_path
        ? ("uploaded" as const)
        : row.external_id
          ? ("catalog" as const)
          : ("reference" as const),
    }));
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
              <FileList files={files} timezone={workspace.timezone} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
