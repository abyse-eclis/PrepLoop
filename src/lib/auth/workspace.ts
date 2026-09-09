import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Workspace } from "@/types/db";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Resolve the signed-in user from the request cookies.
 *
 * Uses `getClaims()`, which verifies the JWT signature locally (Supabase
 * asymmetric signing keys; the JWKS is fetched once and cached) instead of
 * `getUser()`, which is a network round-trip to the Auth server on every call.
 * Projects still on the legacy HS256 secret fall back to a server check inside
 * `getClaims()` itself, so this is never less safe than before.
 *
 * `cache()` makes this run at most once per render request, no matter how many
 * layouts, pages, loaders or server actions ask for the user.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string };
  return { id: claims.sub, email: claims.email ?? null };
});

/** Return the signed-in user or redirect to /login. */
export async function requireUser() {
  const [user, supabase] = await Promise.all([getSessionUser(), createServerSupabase()]);
  if (!user) redirect("/login");
  return { user, supabase };
}

/**
 * Return the user's active workspace (the first one for this MVP), or null if
 * none exists yet. Ownership is enforced by RLS + user_id filter.
 *
 * Request-cached: the layout, the page and every server action in the same
 * request share one lookup.
 */
export const getActiveWorkspace = cache(async function getActiveWorkspace(): Promise<Workspace | null> {
  const [user, supabase] = await Promise.all([getSessionUser(), createServerSupabase()]);
  if (!user) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Workspace | null) ?? null;
});

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
