-- Fix: Allow video files in the 'paintings' storage bucket (used for stories)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Add video MIME types to the paintings bucket if it has type restrictions
--    (If allowed_mime_types is NULL, all types are already allowed and this is a no-op)
UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-m4v',
    'video/3gpp',
    'video/3gpp2'
]
WHERE id = 'paintings'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('video/mp4' = ANY(allowed_mime_types));

-- 2. Show current bucket configuration to verify
SELECT id, name, allowed_mime_types, file_size_limit
FROM storage.buckets
WHERE id = 'paintings';

-- 3. If videos are still blocked after the above, run this to remove all MIME restrictions:
-- UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'paintings';
