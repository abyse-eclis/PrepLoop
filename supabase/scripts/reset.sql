-- ============================================================================
-- PrepLoop schema RESET
-- ============================================================================
-- Drops ALL PrepLoop objects in the public schema so the migrations can be
-- re-run from a clean slate. Run this FIRST, then run the migrations in order:
--   0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006
--
-- ⚠️  DESTROYS ALL APP DATA in these tables (profiles, workspaces, courses,
--     lessons, sessions, plans, etc.). Use only while setting things up.
--     Storage FILES in the bucket are NOT removed here (only DB rows).
--
-- Safe to run repeatedly: every drop uses IF EXISTS.
-- ============================================================================

-- Auth trigger on auth.users (created by 0001). Drop before its function.
drop trigger if exists on_auth_user_created on auth.users;

-- Application tables. CASCADE also removes their policies, indexes, FKs and
-- any storage.objects policies that depend on the helper functions below.
drop table if exists
  public.recovery_plan_results,
  public.recovery_requests,
  public.error_logs,
  public.review_tasks,
  public.assessment_topic_results,
  public.assessment_attempts,
  public.study_sessions,
  public.item_status_overrides,
  public.study_plan_items,
  public.study_plan_days,
  public.study_plan_versions,
  public.assessment_sources,
  public.source_files,
  public.course_lessons,
  public.course_sections,
  public.courses,
  public.subjects,
  public.course_catalog_versions,
  public.workspace_config_versions,
  public.import_history,
  public.workspaces,
  public.profiles
  cascade;

-- Helper / trigger functions. CASCADE drops dependent objects such as the
-- storage.objects policies (they call owns_workspace / storage_workspace_id).
drop function if exists public.owns_workspace(uuid) cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.storage_workspace_id(text) cascade;

-- Storage policies (in case they were created without the helper dependency).
drop policy if exists "study-sources select own" on storage.objects;
drop policy if exists "study-sources insert own" on storage.objects;
drop policy if exists "study-sources delete own" on storage.objects;

-- Note: the study-sources storage bucket row is left in place; 0003 re-inserts
-- it with `on conflict do nothing`, so keeping it is fine.
