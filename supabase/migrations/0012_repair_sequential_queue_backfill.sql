-- 0012: Idempotent repair for deployments where 0011 was not applied or was
-- interrupted. This changes no status/session/history rows and creates no item.
alter table public.study_plan_items
  add column if not exists order_index bigint,
  add column if not exists scheduled_at timestamptz;

-- The pre-queue schema had no item-level sequence. Preserve its strongest
-- ordering signals: legacy planned date, then the stable external identifier.
-- Existing non-null positions sort first and keep their relative order. Only a
-- plan with null/duplicate positions is normalized to contiguous 1..N values.
drop index if exists public.spi_version_order_uidx;

with bad_plans as (
  select plan_version_id
  from public.study_plan_items
  group by plan_version_id
  having count(*) filter (where order_index is null) > 0
      or count(order_index) <> count(distinct order_index)
), missing as (
  select item.id,
    row_number() over (
      partition by item.plan_version_id
      order by item.order_index nulls last, item.date, item.stable_external_id,
               item.created_at, item.id
    ) as repaired_position
  from public.study_plan_items item
  join bad_plans on bad_plans.plan_version_id = item.plan_version_id
), repaired as (
  select id, repaired_position
  from missing
)
update public.study_plan_items item
set order_index = repaired.repaired_position
from repaired
where item.id = repaired.id
;

alter table public.study_plan_items alter column order_index set not null;
create unique index if not exists spi_version_order_uidx
  on public.study_plan_items(plan_version_id, order_index);
create index if not exists spi_queue_lookup_idx
  on public.study_plan_items(workspace_id, plan_version_id, order_index);
create index if not exists spi_scheduled_at_idx
  on public.study_plan_items(workspace_id, scheduled_at)
  where scheduled_at is not null;
