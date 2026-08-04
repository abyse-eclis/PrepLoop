-- 0006: Authoritative, idempotent RLS policy set for EVERY table the Learning
-- Source / catalog import writes to.
--
-- Why this exists
-- ---------------
-- The import persists with `upsert` (INSERT ... ON CONFLICT DO UPDATE). When a
-- row already exists (re-import, or rows left by an earlier failed import) the
-- statement takes the UPDATE branch. Postgres then requires a permissive UPDATE
-- policy; without one it raises exactly:
--     new row violates row-level security policy (USING expression)
--         for table "courses"
-- The "(USING expression)" wording is the tell-tale sign of the ON CONFLICT
-- UPDATE branch being denied — not the INSERT branch.
--
-- Migrations 0002 + 0005 already produce the correct end state, but if a
-- database only has 0002 applied (no UPDATE policy) the error persists. Running
-- THIS migration once fixes any prior state: it drops and recreates every
-- SELECT / INSERT / UPDATE / DELETE policy for the import tables, scoped to
-- workspace ownership. Rerun-safe.
--
-- RLS stays ENABLED. No policy is `true`/public, no service role, no hardcoded
-- ids. Every rule is `owns_workspace(workspace_id)` = the workspace belongs to
-- auth.uid(). Cross-workspace writes remain impossible.

do $$
declare
  t text;
  -- Mutable catalog tables the import UPSERTS (need full CRUD, incl. UPDATE).
  crud_tables text[] := array[
    'subjects',
    'courses',
    'course_sections',
    'course_lessons',
    'source_files',
    'assessment_sources'
  ];
  -- Immutable audit tables the import only appends to (SELECT + INSERT [+DELETE]).
  append_tables text[] := array[
    'course_catalog_versions',
    'import_history'
  ];
begin
  -- Full CRUD tables ------------------------------------------------------
  foreach t in array crud_tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);

    -- SELECT: read only your own workspace's rows.
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.owns_workspace(workspace_id));',
      t || '_select', t);

    -- INSERT: the new row must belong to a workspace you own.
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (public.owns_workspace(workspace_id));',
      t || '_insert', t);

    -- UPDATE: both the existing row (USING) and the new row (WITH CHECK) must
    -- belong to a workspace you own. This is the branch `upsert` needs.
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (public.owns_workspace(workspace_id)) '
      || 'with check (public.owns_workspace(workspace_id));',
      t || '_update', t);

    -- DELETE: only your own workspace's rows.
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (public.owns_workspace(workspace_id));',
      t || '_delete', t);
  end loop;

  -- Append-only audit tables ---------------------------------------------
  foreach t in array append_tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.owns_workspace(workspace_id));',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (public.owns_workspace(workspace_id));',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (public.owns_workspace(workspace_id));',
      t || '_delete', t);
  end loop;
end$$;
