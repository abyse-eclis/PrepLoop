import { Suspense } from "react";
import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { addDays, todayInTimezone } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { PLAN_VERSION_STATUS_LABELS } from "@/lib/plans/immutable";
import { diffPlans, summarizeDiff } from "@/lib/plans/diff";
import { PlanSchedule } from "@/features/plans/plan-schedule";
import { getPlanItemResource } from "@/lib/plans/resource";
import { activityLabel } from "@/lib/status";
import { ExternalLink } from "lucide-react";
import {
  ActivateButton,
  RecoveryPanel,
} from "@/features/plans/plan-actions-client";
import {
  getPlanItemByExternalId,
  getPlanItemsForVersion,
  getPlanVersionSummaries,
} from "@/features/plans/data";
import type { PlanItem, PlanVersion } from "@/types/db";
import type { PlanItemInput } from "@/lib/schemas/study-plan";

export const dynamic = "force-dynamic";

type RangeMode = "week" | "month" | "all";

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
  searchParams: Promise<{ v?: string; range?: string; item?: string }>;
}) {
  const { v, range: rawRange, item: selectedItemExternalId } =
    await searchParams;
  const range = parseRange(rawRange);
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

  const today = todayInTimezone(workspace.timezone);
  const versions = await getPlanVersionSummaries(workspace.id);
  const selected =
    versions.find((x) => x.id === v) ??
    versions.find((x) => x.status === "active") ??
    versions[0] ??
    null;
  const bounds = selected ? rangeBounds(range, today, selected) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">แผนการเรียน</h1>
          <p className="text-sm text-muted-foreground">
            เวอร์ชันเดิมแก้ไม่ได้ การเปลี่ยนแผนจะสร้างเวอร์ชันใหม่เสมอ
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
                  href={`/plan?v=${ver.id}&range=${range}`}
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
            {selected && bounds ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selected.name} (v{selected.version_number}) ·{" "}
                      {PLAN_VERSION_STATUS_LABELS[selected.status]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <div className="text-muted-foreground">
                      ช่วงแผน: {selected.start_date} → {selected.end_date}
                      {selected.effective_from
                        ? ` · มีผลตั้งแต่ ${selected.effective_from}`
                        : ""}
                      {selected.effective_to ? ` ถึง ${selected.effective_to}` : ""}
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
                    <div className="flex flex-wrap gap-2">
                      {(["week", "month", "all"] as const).map((mode) => (
                        <Link
                          key={mode}
                          href={`/plan?v=${selected.id}&range=${mode}`}
                        >
                          <Button
                            size="sm"
                            variant={range === mode ? "default" : "outline"}
                          >
                            {mode === "week"
                              ? "สัปดาห์นี้"
                              : mode === "month"
                                ? "เดือนนี้"
                                : "ทั้งหมด"}
                          </Button>
                        </Link>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ตารางที่แสดง: {bounds.label}
                    </p>
                    {selected.status === "draft" ? (
                      <div className="mt-1">
                        <ActivateButton versionId={selected.id} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Suspense fallback={<PlanScheduleSkeleton />}>
                  <PlanScheduleSection
                    workspaceId={workspace.id}
                    selected={selected}
                    bounds={bounds}
                    selectedItemExternalId={selectedItemExternalId}
                  />
                </Suspense>
              </>
            ) : null}

            <RecoveryPanel />
          </div>
        </div>
      )}
    </div>
  );
}

async function PlanScheduleSection({
  workspaceId,
  selected,
  bounds,
  selectedItemExternalId,
}: {
  workspaceId: string;
  selected: PlanVersion;
  bounds: PlanRange;
  selectedItemExternalId?: string;
}) {
  const itemOptions =
    bounds.mode === "all"
      ? {}
      : { start: bounds.start, end: bounds.end };
  const [items, parentItems, selectedItem] = await Promise.all([
    getPlanItemsForVersion(workspaceId, selected.id, itemOptions),
    selected.parent_version_id
      ? getPlanItemsForVersion(workspaceId, selected.parent_version_id, itemOptions)
      : Promise.resolve([]),
    selectedItemExternalId
      ? getPlanItemByExternalId(
          workspaceId,
          selected.id,
          selectedItemExternalId
        )
      : Promise.resolve(null),
  ]);
  const selectedItemResource = selectedItem
    ? getPlanItemResource(selectedItem)
    : null;

  const diff =
    selected.parent_version_id && parentItems.length > 0
      ? diffPlans(toDiffShape(parentItems), toDiffShape(items))
      : [];
  const diffSummary = summarizeDiff(diff);

  return (
    <>
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

      {selectedItem ? (
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดรายการเรียน</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="font-medium">{selectedItem.subject}</div>
            <div className="text-muted-foreground">
              {activityLabel(selectedItem.activity_type)}
              {selectedItem.course_code ? ` · ${selectedItem.course_code}` : ""}
              {selectedItem.lesson_from
                ? ` · คลิป ${selectedItem.lesson_from}`
                : ""}
              {selectedItem.lesson_to &&
              selectedItem.lesson_to !== selectedItem.lesson_from
                ? `–${selectedItem.lesson_to}`
                : ""}
            </div>
            {selectedItem.instructions ? (
              <p className="text-muted-foreground">
                {selectedItem.instructions}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">แหล่งเรียน</span>
              {selectedItemResource ? (
                <>
                  {selectedItemResource.sourceName ? (
                    <span className="text-xs text-muted-foreground">
                      {selectedItemResource.sourceName}
                    </span>
                  ) : null}
                  <a
                    href={selectedItemResource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${selectedItemResource.label}สำหรับ ${selectedItem.subject}${selectedItemResource.sourceName ? ` จาก ${selectedItemResource.sourceName}` : ""}`}
                    title={selectedItemResource.tooltip}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {selectedItemResource.label}
                  </a>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
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
  );
}

function PlanScheduleSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ตารางเรียน</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-9 w-64 rounded-md bg-muted" />
          <div className="h-24 rounded-md bg-muted/70" />
          <div className="h-24 rounded-md bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );
}

interface PlanRange {
  mode: RangeMode;
  label: string;
  start?: string;
  end?: string;
}

function parseRange(value: string | undefined): RangeMode {
  return value === "month" || value === "all" ? value : "week";
}

function rangeBounds(mode: RangeMode, today: string, version: PlanVersion): PlanRange {
  if (mode === "all") {
    return { mode, label: `${version.start_date} → ${version.end_date}` };
  }
  if (mode === "month") {
    const [year, month] = today.split("-").map(Number);
    const start = `${String(year).padStart(4, "0")}-${String(month).padStart(
      2,
      "0"
    )}-01`;
    const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
    const end = `${String(year).padStart(4, "0")}-${String(month).padStart(
      2,
      "0"
    )}-${String(lastDay).padStart(2, "0")}`;
    return { mode, label: `${start} → ${end}`, start, end };
  }

  const [year, month, day] = today.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day!));
  const weekday = d.getUTCDay() || 7;
  const start = addDays(today, -(weekday - 1));
  const end = addDays(start, 6);
  return { mode, label: `${start} → ${end}`, start, end };
}

