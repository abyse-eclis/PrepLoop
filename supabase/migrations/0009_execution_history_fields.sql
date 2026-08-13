-- 0009: Preserve imported execution-history details used by /history matching/UI.
alter table public.study_sessions
  add column if not exists source_activity_id text,
  add column if not exists assessment_source_external_id text,
  add column if not exists activity_type text,
  add column if not exists course_code text,
  add column if not exists score numeric,
  add column if not exists max_score numeric,
  add column if not exists correct int,
  add column if not exists incorrect int,
  add column if not exists total_questions int,
  add column if not exists import_dedup_key text;

create unique index if not exists ss_import_dedup_key_idx
  on public.study_sessions(workspace_id, import_dedup_key)
  where import_dedup_key is not null;
