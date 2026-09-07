-- ---------------------------------------------------------------------------
-- 0015: Hybrid learning resources (paid course / free source) per plan item.
--
-- PrepLoop only *organises and tracks* where a topic is studied from; it never
-- embeds or plays the source. A study plan item (the topic) can point at many
-- resources at once: a purchased course plus free YouTube concept/recap clips.
--
-- study_plan_items stays immutable: the legacy course_code / lesson_from /
-- lesson_to / resource_url / resource_label columns are kept untouched so old
-- plans, exports, diffs and the repair flow keep working. Items without rows
-- here are rendered from those legacy columns as virtual resources (read side),
-- and only materialise into this table when the user changes their status.
--
-- Resource status is execution data (like item_status_overrides), so this table
-- is mutable and owns its own updated_at trigger.
-- ---------------------------------------------------------------------------

-- The learning topic of an item ("การเคลื่อนที่แนวตรง"), which outranks the
-- course code in the UI. Nullable: legacy items fall back to instructions.
alter table public.study_plan_items
  add column if not exists topic text;

create table if not exists public.study_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  study_plan_item_id uuid not null references public.study_plan_items(id) on delete cascade,
  tier text not null,
  type text not null,
  provider text,
  title text not null,
  url text,
  course_code text,
  lesson_from text,
  lesson_to text,
  duration_minutes int,
  status text not null default 'NOT_STARTED',
  access_type text,
  expires_at date,
  limited_watch_time boolean not null default false,
  listen_mode boolean not null default false,
  sort_order int not null default 0,
  -- Set only on rows materialised from an item's legacy columns, so the same
  -- virtual resource can never be inserted twice.
  legacy_key text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_resources_tier_check
    check (tier in ('PAID', 'FREE')),
  constraint study_resources_type_check
    check (type in ('COURSE', 'YOUTUBE', 'DOCUMENT', 'WEBSITE', 'PRACTICE', 'MOCK')),
  constraint study_resources_status_check
    check (status in ('NOT_STARTED', 'LISTENED', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_REQUIRED')),
  constraint study_resources_access_type_check
    check (access_type is null or access_type in ('EXPIRING', 'LIMITED_HOURS', 'FREE', 'PERMANENT')),
  constraint study_resources_url_http_check
    check (url is null or url like 'http://%' or url like 'https://%'),
  constraint study_resources_title_not_blank
    check (length(btrim(title)) > 0)
);

create index if not exists sr_item_idx
  on public.study_resources(study_plan_item_id, sort_order);
create index if not exists sr_ws_idx
  on public.study_resources(workspace_id);
-- Not a partial index: ON CONFLICT cannot infer one, and NULL legacy_key rows
-- (every hand-added or imported resource) stay distinct under a plain unique.
create unique index if not exists sr_item_legacy_key_uidx
  on public.study_resources(study_plan_item_id, legacy_key);

drop trigger if exists trg_study_resources_updated on public.study_resources;
create trigger trg_study_resources_updated before update on public.study_resources
  for each row execute function public.set_updated_at();

-- RLS: same ownership rule as every other workspace-scoped table
-- (public.owns_workspace -> workspaces.user_id = auth.uid()). Anonymous callers
-- fail the check, and user B can neither read nor write user A's resources.
alter table public.study_resources enable row level security;

drop policy if exists sr_owner_all on public.study_resources;
create policy sr_owner_all on public.study_resources for all
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
