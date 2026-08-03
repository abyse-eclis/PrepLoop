-- PrepLoop initial schema
-- Conventions:
--   * All user data is scoped by workspace_id -> workspaces.user_id = auth.uid().
--   * Immutable tables (version tables, sessions history) have no UPDATE policy
--     for content-defining rows; new versions are inserted instead.
--   * created_at everywhere; updated_at only on mutable execution tables.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: ownership check via workspace
-- ---------------------------------------------------------------------------
create or replace function public.owns_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  timezone text not null default 'Asia/Bangkok',
  start_date date not null,
  daily_target_minutes int not null default 480,
  nap_target_min int not null default 30,
  nap_target_max int not null default 60,
  active_config_version_id uuid,
  active_plan_version_id uuid,
  active_catalog_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_user_idx on public.workspaces(user_id);

-- ---------------------------------------------------------------------------
-- workspace_config_versions (immutable)
-- ---------------------------------------------------------------------------
create table public.workspace_config_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number int not null,
  config jsonb not null,
  generated_by text not null default 'manual_import',
  created_at timestamptz not null default now(),
  unique (workspace_id, version_number)
);
create index wcv_ws_idx on public.workspace_config_versions(workspace_id);

-- ---------------------------------------------------------------------------
-- course_catalog_versions (immutable import snapshots)
-- ---------------------------------------------------------------------------
create table public.course_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number int not null,
  catalog_name text not null,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, version_number)
);
create index ccv_ws_idx on public.course_catalog_versions(workspace_id);

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null,
  name text,
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);
create index subjects_ws_idx on public.subjects(workspace_id);

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  catalog_version_id uuid references public.course_catalog_versions(id) on delete set null,
  external_id text not null,
  code text not null,
  name text not null,
  subject text not null,
  total_lessons int,
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);
create index courses_ws_idx on public.courses(workspace_id);

-- ---------------------------------------------------------------------------
-- course_sections
-- ---------------------------------------------------------------------------
create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  external_id text not null,
  name text not null,
  order_index int,
  created_at timestamptz not null default now()
);
create index course_sections_course_idx on public.course_sections(course_id);

-- ---------------------------------------------------------------------------
-- course_lessons
-- ---------------------------------------------------------------------------
create table public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  external_id text not null,
  lesson_number text not null,
  title text not null,
  section text,
  order_index int,
  prerequisite_lesson_ids text[] default '{}',
  created_at timestamptz not null default now(),
  unique (course_id, external_id)
);
create index course_lessons_course_idx on public.course_lessons(course_id);

-- ---------------------------------------------------------------------------
-- source_files
-- ---------------------------------------------------------------------------
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text,
  title text not null,
  file_type text not null,
  storage_path text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index source_files_ws_idx on public.source_files(workspace_id);

-- ---------------------------------------------------------------------------
-- assessment_sources
-- ---------------------------------------------------------------------------
create table public.assessment_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text not null,
  type text not null,
  subject text not null,
  title text not null,
  course_code text,
  lesson_from text,
  lesson_to text,
  source_type text not null,
  source_file_id uuid references public.source_files(id) on delete set null,
  question_page_from int,
  question_page_to int,
  answer_page_from int,
  answer_page_to int,
  solution_page_from int,
  solution_page_to int,
  covered_topics text[] default '{}',
  required_completed_lessons text[] default '{}',
  passing_percentage numeric not null default 70,
  notes text,
  created_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create index assessment_sources_ws_idx on public.assessment_sources(workspace_id);

-- ---------------------------------------------------------------------------
-- study_plan_versions (immutable)
-- ---------------------------------------------------------------------------
create table public.study_plan_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_version_id uuid references public.study_plan_versions(id) on delete set null,
  version_number int not null,
  name text not null,
  description text default '',
  start_date date not null,
  end_date date not null,
  status text not null default 'draft', -- draft | active | superseded | archived
  generated_by text not null default 'chatgpt',
  change_reason text,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  unique (workspace_id, version_number)
);
create index spv_ws_idx on public.study_plan_versions(workspace_id);

-- ---------------------------------------------------------------------------
-- study_plan_days (immutable, belongs to a version)
-- ---------------------------------------------------------------------------
create table public.study_plan_days (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_version_id uuid not null references public.study_plan_versions(id) on delete cascade,
  date date not null,
  target_minutes int not null default 0,
  nap_target_minutes int not null default 0,
  notes text default '',
  created_at timestamptz not null default now(),
  unique (plan_version_id, date)
);
create index spd_version_idx on public.study_plan_days(plan_version_id);
create index spd_date_idx on public.study_plan_days(workspace_id, date);

-- ---------------------------------------------------------------------------
-- study_plan_items (immutable, belongs to a day)
-- ---------------------------------------------------------------------------
create table public.study_plan_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_version_id uuid not null references public.study_plan_versions(id) on delete cascade,
  plan_day_id uuid not null references public.study_plan_days(id) on delete cascade,
  date date not null,
  stable_external_id text not null,
  subject text not null,
  course_code text,
  lesson_from text,
  lesson_to text,
  activity_type text not null,
  assessment_source_id text,
  target_minutes int not null default 0,
  priority text not null default 'medium',
  instructions text default '',
  review_reference_ids text[] default '{}',
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index spi_version_idx on public.study_plan_items(plan_version_id);
create index spi_day_idx on public.study_plan_items(plan_day_id);
create index spi_date_idx on public.study_plan_items(workspace_id, date);

-- ---------------------------------------------------------------------------
-- item_status_overrides (mutable execution status per item)
-- Keeps plan items immutable while allowing status changes.
-- ---------------------------------------------------------------------------
create table public.item_status_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_item_id uuid not null references public.study_plan_items(id) on delete cascade,
  status text not null default 'not_started',
  actual_lesson_from text,
  actual_lesson_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_item_id)
);
create index iso_item_idx on public.item_status_overrides(plan_item_id);

-- ---------------------------------------------------------------------------
-- study_sessions (mutable execution data)
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_item_id uuid references public.study_plan_items(id) on delete set null,
  subject text,
  session_date date not null,
  start_time text,   -- HH:MM
  end_time text,     -- HH:MM
  duration_minutes int not null default 0, -- server-computed source of truth
  status text not null default 'completed', -- studying|paused|completed|interrupted
  actual_lesson_from text,
  actual_lesson_to text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ss_ws_date_idx on public.study_sessions(workspace_id, session_date);
create index ss_item_idx on public.study_sessions(plan_item_id);

-- ---------------------------------------------------------------------------
-- assessment_attempts (mutable execution data)
-- ---------------------------------------------------------------------------
create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assessment_source_id uuid references public.assessment_sources(id) on delete set null,
  plan_item_id uuid references public.study_plan_items(id) on delete set null,
  subject text,
  attempt_date date not null,
  score numeric not null default 0,
  max_score numeric not null default 0,
  total_questions int,
  correct int,
  incorrect int,
  skipped int,
  guessed int,
  duration_minutes int,
  passing_percentage numeric not null default 70,
  percentage numeric,
  passed boolean,
  completed_on_time boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index aa_ws_date_idx on public.assessment_attempts(workspace_id, attempt_date);

-- ---------------------------------------------------------------------------
-- assessment_topic_results
-- ---------------------------------------------------------------------------
create table public.assessment_topic_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  topic text not null,
  error_type text,
  is_weakness boolean not null default true,
  created_at timestamptz not null default now()
);
create index atr_attempt_idx on public.assessment_topic_results(attempt_id);

-- ---------------------------------------------------------------------------
-- review_tasks (mutable status/result)
-- ---------------------------------------------------------------------------
create table public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_type text not null, -- lesson | assessment
  source_ref text,
  subject text,
  course_code text,
  lesson_from text,
  lesson_to text,
  rule text not null,
  due_date date not null,
  reason text,
  instructions text[] default '{}',
  status text not null default 'pending', -- pending | done | skipped
  result text,
  next_review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rt_ws_due_idx on public.review_tasks(workspace_id, due_date);

-- ---------------------------------------------------------------------------
-- error_logs
-- ---------------------------------------------------------------------------
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attempt_id uuid references public.assessment_attempts(id) on delete set null,
  subject text,
  topic text,
  error_type text not null,
  out_of_scope boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index el_ws_idx on public.error_logs(workspace_id);

-- ---------------------------------------------------------------------------
-- recovery_requests + results (immutable audit)
-- ---------------------------------------------------------------------------
create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_plan_version_id uuid references public.study_plan_versions(id) on delete set null,
  effective_from date not null,
  trigger_reason text,
  payload jsonb not null,
  mode text not null default 'ai', -- ai | mock
  status text not null default 'pending', -- pending | previewed | applied | discarded
  created_at timestamptz not null default now()
);
create index rr_ws_idx on public.recovery_requests(workspace_id);

create table public.recovery_plan_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null references public.recovery_requests(id) on delete cascade,
  result jsonb not null,
  applied_plan_version_id uuid references public.study_plan_versions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index rpr_request_idx on public.recovery_plan_results(request_id);

-- ---------------------------------------------------------------------------
-- import_history (immutable audit of imports)
-- ---------------------------------------------------------------------------
create table public.import_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_type text not null, -- workspace_config | learning_source | study_plan
  summary jsonb not null,
  created_at timestamptz not null default now()
);
create index ih_ws_idx on public.import_history(workspace_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for mutable tables
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger trg_source_files_updated before update on public.source_files
  for each row execute function public.set_updated_at();
create trigger trg_item_status_updated before update on public.item_status_overrides
  for each row execute function public.set_updated_at();
create trigger trg_sessions_updated before update on public.study_sessions
  for each row execute function public.set_updated_at();
create trigger trg_attempts_updated before update on public.assessment_attempts
  for each row execute function public.set_updated_at();
create trigger trg_reviews_updated before update on public.review_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile auto-provision on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
