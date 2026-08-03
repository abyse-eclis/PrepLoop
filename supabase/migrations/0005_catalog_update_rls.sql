-- 0005: Add UPDATE RLS policies for catalog tables that are UPSERTED on import.
--
-- Root cause of "new row violates row-level security policy for table courses":
-- In 0002_rls.sql these catalog tables were given only SELECT / INSERT / DELETE
-- policies (they were grouped with the immutable version tables). But the
-- Learning Source import uses `upsert` (INSERT ... ON CONFLICT DO UPDATE). Once
-- a row already exists (a re-import, or rows left over from a previously failed
-- import) the statement takes the UPDATE branch, and with no UPDATE policy RLS
-- denies it. These are mutable catalog tables (unlike *_versions / import_history
-- which stay insert-only), so they legitimately need UPDATE.
--
-- Fix: add UPDATE policies scoped to workspace ownership (USING + WITH CHECK),
-- exactly the same authorization rule as the other policies. RLS stays ON; no
-- service role, no `true` policy, no hardcoded ids. Idempotent + rerun-safe.

do $$
declare
  t text;
  catalog_tables text[] := array[
    'subjects',
    'courses',
    'course_sections',
    'course_lessons',
    'assessment_sources'
  ];
begin
  foreach t in array catalog_tables loop
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update '
      || 'using (public.owns_workspace(workspace_id)) '
      || 'with check (public.owns_workspace(workspace_id));',
      t || '_update', t
    );
  end loop;
end$$;
