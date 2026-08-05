-- 0008: Optional standard resource links on study plan items.
alter table public.study_plan_items
  add column if not exists resource_url text,
  add column if not exists resource_label text;

alter table public.study_plan_items
  drop constraint if exists study_plan_items_resource_url_http_check;

alter table public.study_plan_items
  add constraint study_plan_items_resource_url_http_check
  check (
    resource_url is null
    or resource_url like 'http://%'
    or resource_url like 'https://%'
  );
