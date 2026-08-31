-- ---------------------------------------------------------------------------
-- daily_execution_orders (custom task execution order per workspace + date)
-- Does NOT modify the immutable study plan items or plan versions.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_execution_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_date date not null,
  ordered_item_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, execution_date)
);

create index if not exists deo_ws_date_idx on public.daily_execution_orders(workspace_id, execution_date);

alter table public.daily_execution_orders enable row level security;

drop policy if exists deo_owner_all on public.daily_execution_orders;
create policy deo_owner_all on public.daily_execution_orders for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));
