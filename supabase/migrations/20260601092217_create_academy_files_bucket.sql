
-- 버킷 생성 (비공개, 인증된 사용자만 접근)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'academy-files',
  'academy-files',
  false,
  10485760, -- 10MB
  ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/pdf',
    'text/csv'
  ]
);

-- RLS: 자기 폴더(user_id/)만 읽기/쓰기/삭제 가능
CREATE POLICY "owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'academy-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'academy-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'academy-files' AND (storage.foldername(name))[1] = auth.uid()::text);
;
