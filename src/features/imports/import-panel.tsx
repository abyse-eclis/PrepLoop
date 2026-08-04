"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  schemaForImportType,
  IMPORT_TYPE_LABELS,
  IMPORT_TYPES,
  validateWithSchema,
  executionHistorySchema,
  type ImportType,
  type ParseIssue,
} from "@/lib/schemas";
import { detectImportType } from "@/lib/imports/detect";
import { normalizeExecutionHistory } from "@/lib/imports/execution-history-normalize";
import {
  importWorkspaceConfig,
  importLearningSource,
  importStudyPlan,
  importExecutionHistory,
  type ImportResult,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/components/ui/toast";

function previewOf(type: ImportType, data: unknown): Record<string, number> {
  const d = data as Record<string, unknown>;
  if (type === "workspace_config") {
    return { examEvents: (d.examEvents as unknown[])?.length ?? 0 };
  }
  if (type === "learning_source") {
    const courses = (d.courses as Array<{ lessons?: unknown[] }>) ?? [];
    return {
      courses: courses.length,
      lessons: courses.reduce((s, c) => s + (c.lessons?.length ?? 0), 0),
      sourceFiles: (d.sourceFiles as unknown[])?.length ?? 0,
      assessmentSources: (d.assessmentSources as unknown[])?.length ?? 0,
    };
  }
  if (type === "execution_history") {
    const parsed = executionHistorySchema.safeParse(data);
    if (!parsed.success) return { records: (d.records as unknown[])?.length ?? 0 };
    const norm = normalizeExecutionHistory(parsed.data);
    return {
      records: parsed.data.records.length,
      sessions: norm.sessions.length,
      days: norm.dayCount,
      totalMinutes: norm.totalMinutes,
    };
  }
  const days = (d.days as Array<{ items?: unknown[] }>) ?? [];
  return {
    days: days.length,
    items: days.reduce((s, day) => s + (day.items?.length ?? 0), 0),
  };
}

const TYPE_OPTIONS = IMPORT_TYPES.map((t) => ({
  value: t,
  label: IMPORT_TYPE_LABELS[t],
}));

export function ImportPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = useState<ImportType>("workspace_config");
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<ParseIssue[] | null>(null);
  const [mismatch, setMismatch] = useState<{ detected: ImportType } | null>(null);
  const [detectedInfo, setDetectedInfo] = useState<ImportType | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [validData, setValidData] = useState<unknown>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const schema = useMemo(() => schemaForImportType(type), [type]);

  function resetValidation() {
    setIssues(null);
    setMismatch(null);
    setPreview(null);
    setValidData(null);
    setResult(null);
  }

  function validateWith(targetType: ImportType, source: string) {
    resetValidation();
    let json: unknown;
    try {
      json = JSON.parse(source);
    } catch (e) {
      setIssues([
        { path: "(root)", message: `JSON ไม่ถูกต้อง: ${(e as Error).message}` },
      ]);
      return;
    }

    const detected = detectImportType(json);
    setDetectedInfo(detected);
    if (detected && detected !== targetType) {
      setMismatch({ detected });
      return;
    }

    const r = validateWithSchema(json, schemaForImportType(targetType));
    if (!r.ok) {
      setIssues(r.issues);
      return;
    }
    setIssues([]);
    setValidData(r.data);
    setPreview(previewOf(targetType, r.data));
  }

  function switchToDetected() {
    if (!mismatch) return;
    const detected = mismatch.detected;
    setType(detected);
    validateWith(detected, text);
  }

  const canConfirm = validData !== null && !mismatch && !pending;

  function confirm() {
    if (validData === null) return;
    setResult(null);
    startTransition(async () => {
      let res: ImportResult;
      if (type === "workspace_config") res = await importWorkspaceConfig(text);
      else if (type === "learning_source") res = await importLearningSource(text);
      else if (type === "execution_history") res = await importExecutionHistory(text);
      else res = await importStudyPlan(text);
      setResult(res);
      toast(
        res.ok
          ? { variant: "success", title: "นำเข้าสำเร็จ", description: res.message }
          : { variant: "error", title: "นำเข้าไม่สำเร็จ", description: res.error }
      );
      if (res.ok) {
        setText("");
        setValidData(null);
        setPreview(null);
        setIssues(null);
        router.refresh();
      }
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      file.type &&
      file.type !== "application/json" &&
      !file.name.endsWith(".json")
    ) {
      setIssues([{ path: "(file)", message: "รองรับเฉพาะไฟล์ .json" }]);
      return;
    }
    const content = await file.text();
    setText(content);
    resetValidation();
    // Auto-detect and switch the type to match the file.
    try {
      const detected = detectImportType(JSON.parse(content));
      setDetectedInfo(detected);
      if (detected) setType(detected);
    } catch {
      /* ignore — will surface on validate */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>นำเข้า JSON</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>ประเภท JSON</Label>
          <Combobox
            value={type}
            onValueChange={(v) => {
              if (!v) return;
              setType(v as ImportType);
              resetValidation();
            }}
            options={TYPE_OPTIONS}
            placeholder="เลือกประเภท JSON"
            searchable={false}
            aria-label="ประเภท JSON"
          />
          {detectedInfo ? (
            <p className="text-xs text-muted-foreground">
              ตรวจพบไฟล์ประเภท:{" "}
              <span className="text-foreground">
                {IMPORT_TYPE_LABELS[detectedInfo]}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>วาง JSON หรืออัปโหลดไฟล์ .json</Label>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (validData !== null || issues || mismatch) resetValidation();
            }}
            rows={10}
            placeholder='{ "schemaVersion": "1.0", ... }'
            className="font-mono text-xs"
          />
          <input
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="mt-1 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => validateWith(type, text)}
            disabled={!text.trim()}
          >
            ตรวจสอบ (Validate)
          </Button>
          <Button onClick={confirm} disabled={!canConfirm}>
            {pending ? "กำลังนำเข้า…" : "ยืนยันนำเข้า"}
          </Button>
        </div>

        {mismatch ? (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3">
            <p className="text-sm font-medium text-yellow-300">
              ประเภทที่เลือกไม่ตรงกับข้อมูลในไฟล์
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              เลือกไว้: {IMPORT_TYPE_LABELS[type]} · ตรวจพบ:{" "}
              {IMPORT_TYPE_LABELS[mismatch.detected]}
            </p>
            <Button size="sm" className="mt-2" onClick={switchToDetected}>
              เปลี่ยนเป็น {IMPORT_TYPE_LABELS[mismatch.detected]}
            </Button>
          </div>
        ) : null}

        {issues && issues.length > 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">
              พบข้อผิดพลาด {issues.length} จุด — ไม่บันทึกข้อมูลใด ๆ
            </p>
            <ul className="mt-2 space-y-1 text-xs text-destructive">
              {issues.slice(0, 20).map((i, idx) => (
                <li key={idx}>
                  <span className="font-mono">{i.path}</span>: {i.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {issues && issues.length === 0 && preview ? (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3">
            <p className="text-sm font-medium text-primary">
              ผ่านการตรวจสอบ ({IMPORT_TYPE_LABELS[type]}) — พร้อมนำเข้า
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {Object.entries(preview).map(([k, v]) => (
                <span key={k} className="text-muted-foreground">
                  {k}: <span className="text-foreground">{v}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {result ? <ImportResultView result={result} /> : null}
      </CardContent>
    </Card>
  );
}

function ImportResultView({ result }: { result: ImportResult }) {
  return (
    <div>
      <p className={result.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
        {result.message ?? result.error}
      </p>

      {result.learningSummary ? (
        <div className="mt-2 rounded-md border border-border p-3 text-xs">
          <div className="scroll-x">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Entity</th>
                  <th className="py-1 pr-3">ใหม่</th>
                  <th className="py-1 pr-3">อัปเดต</th>
                  <th className="py-1 pr-3">ไม่เปลี่ยน</th>
                  <th className="py-1 pr-3">ซ้ำที่ตัดออก</th>
                </tr>
              </thead>
              <tbody>
                {result.learningSummary.entities.map((e) => (
                  <tr key={e.entity} className="border-t border-border/60">
                    <td className="py-1 pr-3">{e.entity}</td>
                    <td className="py-1 pr-3 tabular-nums">{e.created}</td>
                    <td className="py-1 pr-3 tabular-nums">{e.updated}</td>
                    <td className="py-1 pr-3 tabular-nums">{e.unchanged}</td>
                    <td className="py-1 pr-3 tabular-nums">{e.duplicatesRemoved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.learningSummary.duplicateNotes.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-yellow-300">
              {result.learningSummary.duplicateNotes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {result.historySummary ? (
        <div className="mt-2 rounded-md border border-border p-3 text-xs">
          <div className="flex flex-wrap gap-3">
            <span className="text-muted-foreground">
              สร้าง: <span className="text-foreground">{result.historySummary.created}</span>
            </span>
            <span className="text-muted-foreground">
              ข้าม (ซ้ำ):{" "}
              <span className="text-foreground">{result.historySummary.skippedDuplicate}</span>
            </span>
            <span className="text-muted-foreground">
              มีปัญหา:{" "}
              <span className="text-foreground">{result.historySummary.failed}</span>
            </span>
            <span className="text-muted-foreground">
              วัน: <span className="text-foreground">{result.historySummary.dayCount}</span>
            </span>
            <span className="text-muted-foreground">
              เวลารวม:{" "}
              <span className="text-foreground">{result.historySummary.totalMinutes} นาที</span>
            </span>
          </div>
          {result.historySummary.recordIssues.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-yellow-300">
              {result.historySummary.recordIssues.slice(0, 20).map((r, i) => (
                <li key={i}>
                  • record #{r.recordIndex} ({r.date ?? "?"}) · {r.field}: {r.reason} — คาดหวัง{" "}
                  {r.expected}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {result.debug ? (
        <pre className="mt-2 overflow-auto rounded-md border border-border bg-background p-2 text-[10px] text-muted-foreground">
          {JSON.stringify(result.debug, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
