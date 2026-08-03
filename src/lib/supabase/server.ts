import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Server-side Supabase client bound to the request cookies (RLS-enforced,
 * acts as the signed-in user).
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore; middleware refreshes.
        }
      },
    },
  });
}

/**
 * Service-role client for privileged server operations (e.g. signed URLs,
 * storage). NEVER expose to the client. Bypasses RLS — always check ownership
 * explicitly before using it to read/write user data.
 */
export function createServiceSupabase() {
  const env = serverEnv();
  if (!env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ไม่ได้ตั้งค่า");
  }
  return createServerClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op: service client is stateless
      },
    },
  });
}
