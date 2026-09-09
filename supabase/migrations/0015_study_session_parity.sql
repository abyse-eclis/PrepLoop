-- 0015: Unified study-session model for the Today page.
--
-- Backward compatible: only nullable columns and indexes are added. No row is
-- modified, no column is dropped or renamed, and every status value that
-- existed before keeps its meaning.
--
-- New status value on both execution tables:
--   'deferred'  ("ถัดไป") — still owed, the learner chose to do something else
--                first. Sorted to the end of today's queue and carried into the
--                next day's rollover. NOT the same as 'skipped', which means the
--                item will not be studied at all.
--
-- item_status_overrides.status: not_started | studying | paused | completed |
--   incomplete | needs_review | recovery | skipped | cancelled | deferred
-- custom_study_items.status:    not_started | studying | paused | completed |
--   skipped | deferred

-- Plan items are immutable, so learner-owned fields live on the override row.
alter table public.item_status_overrides
  add column if not exists notes text,
  add column if not exists completed_at timestamptz,
  add column if not exists deferred_at timestamptz,
  add column if not exists deferred_from_date date;

alter table public.custom_study_items
  add column if not exists completed_at timestamptz,
  add column if not exists deferred_at timestamptz,
  add column if not exists deferred_from_date date;

comment on column public.item_status_overrides.notes is
  'Learner note for this plan item (plan items themselves are immutable).';
comment on column public.item_status_overrides.deferred_at is
  'When the learner pressed "ถัดไป". Null unless status = deferred.';
comment on column public.item_status_overrides.deferred_from_date is
  'The study date the item was deferred from, for end-of-day rollover.';
comment on column public.custom_study_items.deferred_at is
  'When the learner pressed "ถัดไป". Null unless status = deferred.';
comment on column public.custom_study_items.deferred_from_date is
  'The study date the item was deferred from, for end-of-day rollover.';

-- Indexes matching the Today/queue query shapes. All previous queries on these
-- tables filtered by workspace_id without a supporting index.
create index if not exists iso_ws_idx
  on public.item_status_overrides(workspace_id);
create index if not exists iso_ws_status_idx
  on public.item_status_overrides(workspace_id, status);
create index if not exists ss_ws_plan_item_idx
  on public.study_sessions(workspace_id, plan_item_id);
create index if not exists ss_ws_custom_item_idx
  on public.study_sessions(workspace_id, custom_study_item_id)
  where custom_study_item_id is not null;
create index if not exists spi_ws_stable_idx
  on public.study_plan_items(workspace_id, stable_external_id);
create index if not exists csi_ws_status_idx
  on public.custom_study_items(workspace_id, study_date, status);
