-- 0004: richer source_files metadata + idempotency + storage key hardening.
-- Additive only. Does NOT modify already-deployed migrations.

-- ---------------------------------------------------------------------------
-- source_files: add metadata columns
-- ---------------------------------------------------------------------------
alter table public.source_files
  add column if not exists original_file_name text,
  add column if not exists display_name text,
  add column if not exists extension text,
  add column if not exists mime_type text,
  add column if not exists checksum text,
  add column if not exists storage_bucket text not null default 'study-sources',
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null;

-- Backfill from existing columns so old rows stay consistent.
update public.source_files
set display_name = coalesce(display_name, title),
    original_file_name = coalesce(original_file_name, title),
    mime_type = coalesce(mime_type, file_type)
where display_name is null or original_file_name is null or mime_type is null;

-- ---------------------------------------------------------------------------
-- Idempotency: catalog-imported files upsert on (workspace_id, external_id).
-- A FULL unique index (not partial) so a bare ON CONFLICT (workspace_id,
-- external_id) matches it. Uploaded files use external_id = NULL, and SQL
-- treats NULLs as DISTINCT, so many independent uploads never collide here.
-- ---------------------------------------------------------------------------
create unique index if not exists source_files_ws_extid_uidx
  on public.source_files(workspace_id, external_id);

-- Content-dedup lookups for uploaded files.
create index if not exists source_files_ws_checksum_idx
  on public.source_files(workspace_id, checksum);

-- ---------------------------------------------------------------------------
-- Storage key hardening
-- Objects now use: workspaces/{workspaceId}/learning-sources/{uuid}.{ext}
-- The 0003 policies read (storage.foldername(name))[1]::uuid, which breaks for
-- this layout. Replace them with a robust helper that extracts + validates the
-- workspace uuid (returns NULL for non-matching names instead of erroring).
-- ---------------------------------------------------------------------------
create or replace function public.storage_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  parts text[];
  candidate text;
begin
  if object_name is null then
    return null;
  end if;
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) >= 2 and parts[1] = 'workspaces' then
    candidate := parts[2];
  else
    candidate := parts[1];
  end if;
  if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return candidate::uuid;
  end if;
  return null;
end;
$$;

drop policy if exists "study-sources select own" on storage.objects;
drop policy if exists "study-sources insert own" on storage.objects;
drop policy if exists "study-sources delete own" on storage.objects;

create policy "study-sources select own"
  on storage.objects for select
  using (
    bucket_id = 'study-sources'
    and public.owns_workspace(public.storage_workspace_id(name))
  );

create policy "study-sources insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'study-sources'
    and public.owns_workspace(public.storage_workspace_id(name))
  );

create policy "study-sources delete own"
  on storage.objects for delete
  using (
    bucket_id = 'study-sources'
    and public.owns_workspace(public.storage_workspace_id(name))
  );
