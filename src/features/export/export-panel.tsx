"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Alert } from "@/components/ui/alert";
import {
  EXPORT_RANGE_KINDS,
  EXPORT_RANGE_LABELS,
  resolveExportRange,
  type ExportRangeKind,
} from "@/lib/export/range";
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_HINTS,
  EXPORT_FORMAT_LABELS,
  exportFilename,
  type ExportFormat,
} from "@/lib/export/format";
import { weekBounds, monthBounds, formatDateKeyThai } from "@/lib/dates";

const FORMAT_OPTIONS = EXPORT_FORMATS.map((value) => ({
  value,
  label: EXPORT_FORMAT_LABELS[value],
}));

/**
 * Pick a range and a file shape, then download.
 *
 * The link points at /api/export, which resolves the range again server-side —
 * this preview only has to agree with it, not to be trusted by it. "ทั้งหมด"
 * has no preview bounds because only the server knows the first day with data.
 */
export function ExportPanel({ today }: { today: string }) {
  const [range, setRange] = useState<ExportRangeKind>("daily");
  const [format, setFormat] = useState<ExportFormat>("csv-daily");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const isCustom = range === "custom";
  const isAll = range === "all";

  const resolved = isAll
    ? null
    : resolveExportRange({
        kind: range,
        today,
        start: start || null,
        end: end || null,
      });
  const error = resolved && !resolved.ok ? resolved.error : null;
  const bounds = resolved && resolved.ok ? resolved.range : null;

  const params = new URLSearchParams({ range, format });
  if (isCustom) {
    params.set("start", start);
    params.set("end", end);
  }
  const href = `/api/export?${params.toString()}`;
  const ready = isAll || Boolean(bounds);

  const previewName = bounds
    ? exportFilename(format, bounds.start, bounds.end)
    : `preploop-…-${format === "json" ? "json" : "csv"}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ส่งออกข้อมูลการเรียน</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          ดาวน์โหลดข้อมูลจริงของคุณเป็นไฟล์ · CSV เปิดใน Excel/Google Sheets ได้เลย
          (ใส่ BOM ให้ภาษาไทยไม่เพี้ยน) · JSON เก็บครบทุกอย่างในไฟล์เดียว
          เอาไปวางใน ChatGPT ต่อได้
        </p>

        <div className="flex flex-col gap-2">
          <Label className="text-xs">ช่วงเวลา</Label>
          <div className="flex flex-wrap gap-2">
            {EXPORT_RANGE_KINDS.map((kind) => (
              <Button
                key={kind}
                size="sm"
                variant={range === kind ? "default" : "outline"}
                onClick={() => setRange(kind)}
              >
                {EXPORT_RANGE_LABELS[kind]}
              </Button>
            ))}
          </div>
        </div>

        {isCustom ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">วันที่เริ่ม</Label>
              <DatePicker
                value={start}
                onChange={setStart}
                max={end || undefined}
                buddhist
                aria-label="วันที่เริ่ม"
              />
            </div>
            <span className="pb-2">–</span>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">วันที่สิ้นสุด</Label>
              <DatePicker
                value={end}
                onChange={setEnd}
                min={start || undefined}
                buddhist
                aria-label="วันที่สิ้นสุด"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label className="text-xs">รูปแบบไฟล์</Label>
          <Combobox
            value={format}
            onValueChange={(v) => setFormat((v as ExportFormat) ?? "csv-daily")}
            options={FORMAT_OPTIONS}
            searchable={false}
            aria-label="รูปแบบไฟล์"
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            {EXPORT_FORMAT_HINTS[format]}
          </p>
        </div>

        <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          {isAll ? (
            <p>ช่วง: ทั้งหมด — ตั้งแต่วันแรกที่มีข้อมูลจนถึงวันล่าสุด</p>
          ) : bounds ? (
            <p>
              ช่วง: {formatDateKeyThai(bounds.start, { buddhist: true })}
              {bounds.start === bounds.end
                ? ""
                : ` – ${formatDateKeyThai(bounds.end, { buddhist: true })}`}{" "}
              ({bounds.start} → {bounds.end})
            </p>
          ) : (
            <p>ช่วง: ยังเลือกไม่ครบ</p>
          )}
          <p className="mt-1 break-all">ไฟล์: {previewName}</p>
        </div>

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div>
          {ready ? (
            <a
              href={href}
              className={buttonVariants({ size: "sm" })}
              aria-label={`ดาวน์โหลด ${EXPORT_FORMAT_LABELS[format]}`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              ดาวน์โหลด
            </a>
          ) : (
            <Button size="sm" disabled>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              ดาวน์โหลด
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          สัปดาห์นี้ = {weekBounds(today).start} → {weekBounds(today).end} ·
          เดือนนี้ = {monthBounds(today).start} → {monthBounds(today).end}
        </p>
      </CardContent>
    </Card>
  );
}
