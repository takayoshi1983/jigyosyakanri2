-- Supabase Storage バックアップバケット作成用SQL
-- Supabaseコンソールでこのコマンドを実行してください

-- 1. バックアップ用バケットを作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'backups',
  'backups', 
  false,
  52428800, -- 50MB制限
  '{"application/json"}'
);

-- 2. バックアップバケットへのアクセス権限設定（認証済みユーザーのみ）
CREATE POLICY "Authenticated users can upload backups" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups');

CREATE POLICY "Authenticated users can download backups" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'backups');

CREATE POLICY "Authenticated users can update backups" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'backups');

CREATE POLICY "Authenticated users can delete backups" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'backups');