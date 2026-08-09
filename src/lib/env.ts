/**
 * Centralized environment access. Public vars are exposed to the client;
 * secrets are only read in server contexts.
 */
import {
  ALLOWED_UPLOAD_MIME as ALLOWED_MIME,
  STORAGE_BUCKET as BUCKET,
  maxUploadBytes,
} from "@/lib/upload-constants";

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  maxUploadSizeMb: Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ?? "20"),
};

export function getMaxUploadBytes(): number {
  return maxUploadBytes();
}

/** Server-only secrets. Never import these into client components. */
export function serverEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicReviewModel:
      process.env.ANTHROPIC_REVIEW_MODEL ?? "claude-haiku-4-5-20251001",
    anthropicRecoveryModel:
      process.env.ANTHROPIC_RECOVERY_MODEL ?? "claude-haiku-4-5-20251001",
  };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export const ALLOWED_UPLOAD_MIME = ALLOWED_MIME;
export const STORAGE_BUCKET = BUCKET;
