-- 0011: Make ordinary plan items an ordered, rolling study queue.
-- `date` and plan_day_id remain intact as legacy import metadata.  Dates on
-- actual study_sessions remain the source of truth for history/analytics.
alter table public.study_plan_items
  add column if not exists order_index bigint,
  add column if not exists scheduled_at timestamptz;

-- Older imports had no explicit within-day sequence.  Date is therefore the
-- strongest legacy ordering signal; stable_external_id makes ties deterministic
-- without relying on random UUID/created_at ordering.
with ranked as (
  select id,
         row_number() over (
           partition by plan_version_id
           order by date asc, stable_external_id asc, id asc
         ) as position
  from public.study_plan_items
)
update public.study_plan_items item
set order_index = ranked.position
from ranked
where ranked.id = item.id and item.order_index is null;

alter table public.study_plan_items
  alter column order_index set not null;

create unique index if not exists spi_version_order_uidx
  on public.study_plan_items(plan_version_id, order_index);
create index if not exists spi_queue_lookup_idx
  on public.study_plan_items(workspace_id, plan_version_id, order_index);
create index if not exists spi_scheduled_at_idx
  on public.study_plan_items(workspace_id, scheduled_at)
  where scheduled_at is not null;
