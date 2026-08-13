-- Optional cleanup for catalog rows left behind by an earlier FAILED Learning
-- Source import (before the RLS UPDATE fix in 0005).
--
-- You usually do NOT need this: with 0005 applied, simply re-importing the same
-- Learning Source JSON UPSERTS the existing rows to the correct values
-- (idempotent, ids preserved, no progress reset). Run this ONLY if you want to
-- remove catalog rows that no longer exist in your current JSON.
--
-- Safety:
--   * Scoped to a SINGLE workspace you own — set the id below.
--   * Touches ONLY catalog tables (courses / lessons / sections / subjects /
--     assessment_sources / catalog versions). It does NOT delete study_sessions,
--     assessment_attempts, review_tasks, plans, or any execution/progress data.
--   * course_lessons / course_sections cascade from courses via FK ON DELETE
--     CASCADE, so deleting courses removes their children.
--
-- Usage: replace the workspace id, review, then run in the SQL editor.

do $$
declare
  ws uuid := '00000000-0000-0000-0000-000000000000'; -- <-- set your workspace_id
begin
  if not exists (select 1 from public.workspaces where id = ws) then
    raise exception 'workspace % not found', ws;
  end if;

  delete from public.assessment_sources where workspace_id = ws;
  delete from public.courses where workspace_id = ws;          -- cascades lessons/sections
  delete from public.subjects where workspace_id = ws;
  delete from public.course_catalog_versions where workspace_id = ws;

  update public.workspaces set active_catalog_version_id = null where id = ws;

  raise notice 'catalog cleared for workspace %', ws;
end$$;
