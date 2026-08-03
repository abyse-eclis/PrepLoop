-- Storage bucket + policies for private study sources.
-- Files are stored under: {workspace_id}/{uuid}-{sanitized_name}
-- Access is via server-generated signed URLs only.

insert into storage.buckets (id, name, public)
values ('study-sources', 'study-sources', false)
on conflict (id) do nothing;

-- Only allow authenticated users to read/write objects in a folder named after
-- a workspace they own. The first path segment is the workspace_id.
create policy "study-sources select own"
  on storage.objects for select
  using (
    bucket_id = 'study-sources'
    and public.owns_workspace((storage.foldername(name))[1]::uuid)
  );

create policy "study-sources insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'study-sources'
    and public.owns_workspace((storage.foldername(name))[1]::uuid)
  );

create policy "study-sources delete own"
  on storage.objects for delete
  using (
    bucket_id = 'study-sources'
    and public.owns_workspace((storage.foldername(name))[1]::uuid)
  );
