"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export interface ReviewCandidate { id: string; topic: string; subject: string; courseCode?: string | null; note?: string | null; score?: string | null; source: string; lastDate: string; sufficient: boolean; }

function prompt(c: ReviewCandidate) { return `ช่วยสร้างแบบทบทวนเรื่อง${c.topic} วิชา${c.subject} ระดับพื้นฐานถึงปานกลาง จำนวน 10 ข้อ รูปแบบปรนัยและอัตนัยสั้น พร้อมเฉลยละเอียด โดยอิงจากบริบทนี้: ${c.note ?? "ยังไม่มีหมายเหตุเพิ่มเติม"}`; }

export function ReviewAiPanel({ candidates }: { candidates: ReviewCandidate[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => ({ candidates: candidates.slice(0, 12) }), [candidates]);
  async function call(mode: "test" | "analyze" | "generate") {
    setLoading(mode); setError(null); setMessage(null);
    const res = await fetch("/api/reviews/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, summary, requestId: crypto.randomUUID() }) });
    const json = await res.json();
    setLoading(null);
    if (!res.ok) setError(json.error ?? "เรียก API ไม่สำเร็จ"); else setMessage(json.result ?? "สำเร็จ");
  }
  const first = candidates[0];
  return <Card><CardHeader><CardTitle>Claude Haiku สำหรับทบทวน</CardTitle></CardHeader><CardContent className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">ระบบจะไม่เรียก AI อัตโนมัติ กดปุ่มเมื่อต้องการเท่านั้น และส่งเฉพาะสรุปข้อมูลจำเป็น</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!loading} onClick={() => call("test")}>{loading === "test" ? "กำลังทดสอบ…" : "ทดสอบ API"}</Button><Button variant="secondary" disabled={!!loading || candidates.length === 0} onClick={() => call("analyze")}>{loading === "analyze" ? "กำลังวิเคราะห์…" : "วิเคราะห์ข้อมูล"}</Button><Button disabled={!!loading || candidates.length === 0} onClick={() => call("generate")}>{loading === "generate" ? "กำลังสร้าง…" : "สร้างแบบทบทวน"}</Button></div>{error ? <Alert variant="destructive">{error}</Alert> : null}{message ? <Alert variant="success"><pre className="whitespace-pre-wrap font-sans">{message}</pre></Alert> : null}{first && !first.sufficient ? <div className="rounded-md border p-3"><p className="text-sm text-muted-foreground">ข้อมูลยังไม่พอสำหรับประเมินจุดอ่อนเต็มรูปแบบ แต่สร้าง prompt ไปใช้เองได้</p><textarea readOnly className="mt-2 min-h-28 w-full rounded border bg-background p-2 text-sm" value={prompt(first)} /><Button className="mt-2" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(prompt(first))}>Copy prompt</Button></div> : null}</CardContent></Card>;
}
