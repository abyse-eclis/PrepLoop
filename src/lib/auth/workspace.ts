import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Workspace } from "@/types/db";

/** Return the signed-in user or redirect to /login. */
export async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { user, supabase };
}

/**
 * Return the user's active workspace (the first one for this MVP), or null if
 * none exists yet. Ownership is enforced by RLS + user_id filter.
 */
export async function getActiveWorkspace(): Promise<Workspace | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Workspace | null) ?? null;
}

export async function requireWorkspace(): Promise<{
  workspace: Workspace;
  userId: string;
}> {
  const { user } = await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    // No workspace yet — send the user to imports to create one.
    redirect("/imports?setup=1");
  }
  return { workspace, userId: user.id };
}
