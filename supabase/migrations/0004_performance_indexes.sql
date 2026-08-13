-- Targeted indexes for adaptive queue and lighter plan/review pages.
-- These match the application queries introduced for:
--   * plan version metadata/effective-date resolution
--   * plan items by selected version + date range
--   * pending review tasks by due date

create index if not exists spv_ws_status_effective_idx
  on public.study_plan_versions(workspace_id, status, effective_from desc, version_number desc);

create index if not exists spi_version_date_priority_idx
  on public.study_plan_items(plan_version_id, date, priority);

create index if not exists rt_ws_status_due_idx
  on public.review_tasks(workspace_id, status, due_date);

