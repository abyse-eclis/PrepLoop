-- Row Level Security for PrepLoop
-- Every user-data table: SELECT/INSERT/UPDATE/DELETE gated by workspace ownership.
-- Immutable tables intentionally omit UPDATE (and often DELETE) policies.

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_config_versions enable row level security;
alter table public.course_catalog_versions enable row level security;
alter table public.subjects enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.course_lessons enable row level security;
alter table public.source_files enable row level security;
alter table public.assessment_sources enable row level security;
alter table public.study_plan_versions enable row level security;
alter table public.study_plan_days enable row level security;
alter table public.study_plan_items enable row level security;
alter table public.item_status_overrides enable row level security;
alter table public.study_sessions enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_topic_results enable row level security;
alter table public.review_tasks enable row level security;
alter table public.error_logs enable row level security;
alter table public.recovery_requests enable row level security;
alter table public.recovery_plan_results enable row level security;
alter table public.import_history enable row level security;

-- profiles: user owns own row
create policy "profiles self select" on public.profiles
  for select using (id = auth.uid());
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles self insert" on public.profiles
  for insert with check (id = auth.uid());

-- workspaces: user owns rows by user_id
create policy "workspaces select" on public.workspaces
  for select using (user_id = auth.uid());
create policy "workspaces insert" on public.workspaces
  for insert with check (user_id = auth.uid());
create policy "workspaces update" on public.workspaces
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workspaces delete" on public.workspaces
  for delete using (user_id = auth.uid());

-- Generic workspace-scoped policy generator via DO block
do $$
declare
  t text;
  mutable_tables text[] := array[
    'source_files','item_status_overrides','study_sessions',
    'assessment_attempts','review_tasks'
  ];
  -- immutable tables get SELECT + INSERT only (+ DELETE for cleanup where safe)
  insert_select_tables text[] := array[
    'workspace_config_versions','course_catalog_versions','subjects','courses',
    'course_sections','course_lessons','assessment_sources',
    'study_plan_versions','study_plan_days','study_plan_items',
    'assessment_topic_results','error_logs','recovery_requests',
    'recovery_plan_results','import_history'
  ];
begin
  foreach t in array insert_select_tables loop
    execute format(
      'create policy %I on public.%I for select using (public.owns_workspace(workspace_id));',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.owns_workspace(workspace_id));',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for delete using (public.owns_workspace(workspace_id));',
      t || '_delete', t);
  end loop;

  foreach t in array mutable_tables loop
    execute format(
      'create policy %I on public.%I for select using (public.owns_workspace(workspace_id));',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.owns_workspace(workspace_id));',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete using (public.owns_workspace(workspace_id));',
      t || '_delete', t);
  end loop;
end$$;

-- study_plan_versions: allow UPDATE only while draft (status transition to active
-- handled server-side; we still permit the row update but the app enforces
-- immutability of content). We restrict UPDATE to owner.
create policy "spv update owner" on public.study_plan_versions
  for update using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

-- recovery_requests need status updates
create policy "rr update owner" on public.recovery_requests
  for update using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
