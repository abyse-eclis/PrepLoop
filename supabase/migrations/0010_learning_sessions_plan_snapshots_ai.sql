-- Add nullable metadata only; does not mutate imported raw codes or existing rows.
alter table public.course_lessons
  add column if not exists lesson_url text,
  add column if not exists source_type text;

alter table public.study_sessions
  add column if not exists lesson_code text,
  add column if not exists lesson_title text,
  add column if not exists lesson_url text,
  add column if not exists source_type text,
  add column if not exists result text,
  add column if not exists completed boolean,
  add column if not exists video_progress_start numeric,
  add column if not exists video_progress_end numeric;

create table if not exists public.plan_activation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_version_id uuid references public.study_plan_versions(id) on delete set null,
  to_version_id uuid not null references public.study_plan_versions(id) on delete cascade,
  effective_from date not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists pae_ws_changed_idx on public.plan_activation_events(workspace_id, changed_at desc);

create table if not exists public.daily_plan_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  snapshot_date date not null,
  plan_version_id uuid not null references public.study_plan_versions(id) on delete restrict,
  payload jsonb not null,
  started_reason text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, snapshot_date)
);
create index if not exists dps_ws_date_idx on public.daily_plan_snapshots(workspace_id, snapshot_date);

create table if not exists public.review_ai_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  model text not null,
  prompt_version text not null default 'review-haiku-v1',
  source_data_ids text[] default '{}',
  result jsonb not null,
  token_usage jsonb,
  estimated_cost numeric,
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists rar_ws_created_idx on public.review_ai_results(workspace_id, created_at desc);

alter table public.plan_activation_events enable row level security;
alter table public.daily_plan_snapshots enable row level security;
alter table public.review_ai_results enable row level security;

drop policy if exists pae_owner_all on public.plan_activation_events;
create policy pae_owner_all on public.plan_activation_events for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));
drop policy if exists dps_owner_all on public.daily_plan_snapshots;
create policy dps_owner_all on public.daily_plan_snapshots for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));
drop policy if exists rar_owner_all on public.review_ai_results;
create policy rar_owner_all on public.review_ai_results for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));
