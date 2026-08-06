import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { serverEnv } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

const schema = z.object({ mode: z.enum(["test", "analyze", "generate"]), summary: z.unknown().optional(), requestId: z.string().min(8).optional() });
const locks = new Set<string>();

export async function POST(req: Request) {
  const workspace = await getActiveWorkspace();
  if (!workspace) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const env = serverEnv();
  if (!env.anthropicApiKey) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บน server" }, { status: 503 });
  const lock = `${workspace.id}:${parsed.data.mode}:${parsed.data.requestId ?? "default"}`;
  if (locks.has(lock)) return NextResponse.json({ error: "คำขอกำลังประมวลผลอยู่ กรุณารอสักครู่" }, { status: 409 });
  locks.add(lock);
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const isTest = parsed.data.mode === "test";
    const message = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: isTest ? 16 : 1200,
      system: "ตอบภาษาไทย กระชับ และอ้างอิงเฉพาะข้อมูลที่ผู้ใช้ส่งมาเท่านั้น",
      messages: [{ role: "user", content: isTest ? "ตอบว่า API พร้อมใช้งาน" : JSON.stringify(parsed.data.summary).slice(0, 12000) }],
    });
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const createdAt = new Date().toISOString();
    const supabase = await createServerSupabase();
    await supabase.from("review_ai_results").insert({ workspace_id: workspace.id, model: message.model, prompt_version: "review-haiku-v1", source_data_ids: [], result: { mode: parsed.data.mode, text, createdAt }, token_usage: message.usage, estimated_cost: null, status: "success" });
    return NextResponse.json({ model: message.model, createdAt, result: text, usage: message.usage, status: "success" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "เรียก Claude ไม่สำเร็จ" }, { status: 502 });
  } finally {
    locks.delete(lock);
  }
}
