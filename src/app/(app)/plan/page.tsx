import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { PLAN_VERSION_STATUS_LABELS } from "@/lib/plans/immutable";
import { diffPlans, summarizeDiff } from "@/lib/plans/diff";
import { PlanSchedule } from "@/features/plans/plan-schedule";
import {
  ActivateButton,
  RecoveryPanel,
} from "@/features/plans/plan-actions-client";
import type { PlanItem, PlanVersion } from "@/types/db";
import type { PlanItemInput } from "@/lib/schemas/study-plan";

export const dynamic = "force-dynamic";

function toDiffShape(items: PlanItem[]) {
  const byDate = new Map<string, PlanItemInput[]>();
  for (const i of items) {
    const arr = byDate.get(i.date) ?? [];
    arr.push({
      stableExternalId: i.stable_external_id,
      subject: i.subject,
      courseCode: i.course_code,
      lessonFrom: i.lesson_from,
      lessonTo: i.lesson_to,
      activityType: i.activity_type as PlanItemInput["activityType"],
      targetMinutes: i.target_minutes,
      priority: i.priority,
      instructions: i.instructions ?? "",
      resourceUrl: i.resource_url ?? undefined,
      resourceLabel: i.resource_label ?? undefined,
      reviewReferenceIds: i.review_reference_ids ?? [],
    });
    byDate.set(i.date, arr);
  }
  return { days: Array.from(byDate.entries()).map(([date, items]) => ({ date, items })) };
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return (
      <EmptyState
        title="ยังไม่มี Workspace"
        description="นำเข้า Workspace Config JSON ก่อน"
        action={
          <Link href="/imports">
            <Button>ไปหน้านำเข้า</Button>
          </Link>
        }
      />
    );
  }

  const supabase = await createServerSupabase();
  const { data: versionsData } = await supabase
    .from("study_plan_versions")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("version_number", { ascending: false });
  const versions = (versionsData as PlanVersion[] | null) ?? [];

  const selected =
    versions.find((x) => x.id === v) ??
    versions.find((x) => x.status === "active") ??
    versions[0] ??
    null;

  let items: PlanItem[] = [];
  let parentItems: PlanItem[] = [];
  if (selected) {
    const { data: itemData } = await supabase
      .from("study_plan_items")
      .select("*")
      .eq("plan_version_id", selected.id)
      .order("date", { ascending: true });
    items = (itemData as PlanItem[] | null) ?? [];

    if (selected.parent_version_id) {
      const { data: parentData } = await supabase
        .from("study_plan_items")
        .select("*")
        .eq("plan_version_id", selected.parent_version_id);
      parentItems = (parentData as PlanItem[] | null) ?? [];
    }
  }

  const diff =
    selected?.parent_version_id && parentItems.length > 0
      ? diffPlans(toDiffShape(parentItems), toDiffShape(items))
      : [];
  const diffSummary = summarizeDiff(diff);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">แผนการเรียน</h1>
          <p className="text-sm text-muted-foreground">
            เวอร์ชันเดิมแก้ไม่ได้ — การเปลี่ยนแผนจะสร้างเวอร์ชันใหม่เสมอ
          </p>
        </div>
        <Link href="/imports">
          <Button variant="outline">นำเข้าเวอร์ชันใหม่</Button>
        </Link>
      </header>

      {versions.length === 0 ? (
        <EmptyState
          title="ยังไม่มีแผน"
          description="นำเข้า Full Study Plan JSON เพื่อสร้างแผนเวอร์ชันแรก"
          action={
            <Link href="/imports">
              <Button>นำเข้าแผน</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>เวอร์ชัน</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {versions.map((ver) => (
                <Link
                  key={ver.id}
                  href={`/plan?v=${ver.id}`}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    selected?.id === ver.id
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-accent/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">v{ver.version_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {PLAN_VERSION_STATUS_LABELS[ver.status]}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {ver.name}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            {selected ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selected.name} (v{selected.version_number}) ·{" "}
                      {PLAN_VERSION_STATUS_LABELS[selected.status]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm">
                    <div className="text-muted-foreground">
                      ช่วง: {selected.start_date} → {selected.end_date}
                      {selected.effective_from
                        ? ` · มีผลตั้งแต่ ${selected.effective_from}`
                        : ""}
                      {selected.effective_to
                        ? ` ถึง ${selected.effective_to}`
                        : ""}
                    </div>
                    {selected.change_reason ? (
                      <div className="text-muted-foreground">
                        เหตุผล: {selected.change_reason}
                      </div>
                    ) : null}
                    <div className="text-muted-foreground">
                      สร้างโดย: {selected.generated_by}
                      {selected.parent_version_id
                        ? " · มาจากเวอร์ชันก่อนหน้า"
                        : ""}
                    </div>
                    {selected.status === "draft" ? (
                      <div className="mt-1">
                        <ActivateButton versionId={selected.id} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {diff.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        ผลต่างจากเวอร์ชันก่อนหน้า (เพิ่ม {diffSummary.added} · ลบ{" "}
                        {diffSummary.removed} · ย้าย {diffSummary.moved} · แก้{" "}
                        {diffSummary.changed})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {diff.map((d, i) => (
                          <li key={i}>• {d.description}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle>ตารางเรียน</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlanSchedule items={items} />
                  </CardContent>
                </Card>
              </>
            ) : null}

            <RecoveryPanel />
          </div>
        </div>
      )}
    </div>
  );
}
