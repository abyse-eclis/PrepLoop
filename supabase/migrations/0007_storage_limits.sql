-- 0007: raise the study-sources bucket file-size limit + restrict MIME types.
--
-- Uploads now go directly from the browser to Storage (signed upload URLs), so
-- the Vercel ~4.5MB function-body limit no longer applies. The remaining limits
-- are (a) this per-bucket file_size_limit and (b) the PROJECT-level storage
-- upload limit in the Supabase dashboard (Storage → Settings → "Upload file
-- size limit"), which must be raised to at least the same value. On the free
-- plan the project limit currently maxes at 50MB, so files larger than that
-- require raising the project limit (paid plan) or compressing the file.
--
-- Idempotent: safe to re-run.

update storage.buckets
set
  file_size_limit = 104857600, -- 100 MB (bytes)
  allowed_mime_types = array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/json'
  ]
where id = 'study-sources';
