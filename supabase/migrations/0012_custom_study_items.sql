-- ---------------------------------------------------------------------------
-- custom_study_items (Self-directed/external study items added directly by user)
-- Completely isolated from Course, Lesson, and Study Plan items.
-- ---------------------------------------------------------------------------
create table if not exists public.custom_study_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  study_date date not null,
  exam_category text not null, -- 'A-Level' | 'TGAT' | 'TPAT' | 'อื่น ๆ'
  subject text not null,
  custom_subject text,
  title text not null,
  url text,
  estimated_minutes int,
  notes text,
  status text not null default 'not_started', -- 'not_started' | 'studying' | 'paused' | 'completed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists csi_ws_date_idx on public.custom_study_items(workspace_id, study_date);

alter table public.custom_study_items enable row level security;

drop policy if exists csi_owner_all on public.custom_study_items;
create policy csi_owner_all on public.custom_study_items for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));

-- Add nullable references to study_sessions so history tracks custom study cleanly
alter table public.study_sessions
  add column if not exists custom_study_item_id uuid references public.custom_study_items(id) on delete set null,
  add column if not exists exam_category text;
