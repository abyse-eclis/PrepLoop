"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";

export interface ReviewActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const updateSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(["pending", "done", "skipped"]),
  result: z.string().max(1000).optional(),
});

export async function updateReview(
  input: z.infer<typeof updateSchema>
): Promise<ReviewActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("review_tasks")
    .update({
      status: parsed.data.status,
      result: parsed.data.result ?? null,
    })
    .eq("id", parsed.data.reviewId)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/reviews");
  revalidatePath("/today");
  return { ok: true, message: "บันทึกผลทบทวนแล้ว" };
}
