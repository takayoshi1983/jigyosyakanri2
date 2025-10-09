-- ============================================
-- 自動バックアップシステムのセットアップSQL
-- ============================================
-- 実行方法: Supabase Dashboard > SQL Editor で実行
-- または: psql コマンドで実行
--
-- このSQLは以下を設定します:
-- 1. pg_cron 拡張機能の有効化
-- 2. 毎日0:00 JST (15:00 UTC前日) に実行されるcronジョブ
-- 3. backup_history テーブルの作成とRLSポリシー設定
-- ============================================

-- Step 1: pg_cron 拡張機能を有効化
-- 注意: Supabase Pro プラン以上が必要です
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: backup_history テーブルを作成（存在しない場合）
CREATE TABLE IF NOT EXISTS backup_history (
  id BIGSERIAL PRIMARY KEY,
  backup_date TIMESTAMPTZ DEFAULT NOW(),
  backup_type TEXT DEFAULT 'auto',  -- 'auto' または 'manual'
  status TEXT DEFAULT 'pending',     -- 'pending', 'completed', 'failed'
  file_name TEXT,
  file_size_kb INTEGER,
  total_records INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: backup_history テーブルのインデックス作成
CREATE INDEX IF NOT EXISTS idx_backup_history_date
  ON backup_history(backup_date DESC);

CREATE INDEX IF NOT EXISTS idx_backup_history_status
  ON backup_history(status);

CREATE INDEX IF NOT EXISTS idx_backup_history_type
  ON backup_history(backup_type);

-- Step 4: RLS (Row Level Security) を有効化
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- Step 5: RLS ポリシーを作成
-- 認証済みユーザーは閲覧可能
DROP POLICY IF EXISTS "Allow authenticated users to view backup history" ON backup_history;
CREATE POLICY "Allow authenticated users to view backup history"
  ON backup_history
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- サービスロールは全操作可能
DROP POLICY IF EXISTS "Allow service role full access to backup history" ON backup_history;
CREATE POLICY "Allow service role full access to backup history"
  ON backup_history
  FOR ALL
  USING (true);

-- Step 6: 既存のcronジョブを削除（存在する場合）
SELECT cron.unschedule('daily-backup-job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-backup-job'
);

-- Step 7: 毎日0:00 JST (15:00 UTC前日) に実行されるcronジョブを作成
-- 注意: Supabase Edge Functionを呼び出すために http 拡張が必要
CREATE EXTENSION IF NOT EXISTS http;

SELECT cron.schedule(
  'daily-backup-job',           -- ジョブ名
  '0 15 * * *',                 -- 毎日15:00 UTC (翌日0:00 JST)
  $$
  SELECT
    net.http_post(
      url := 'https://jhjexgkzzbzxhhlezaoa.supabase.co/functions/v1/daily-backup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Step 8: セットアップ完了の記録
INSERT INTO backup_history (
  backup_type,
  status,
  file_name,
  total_records,
  error_message
)
VALUES (
  'setup',
  'completed',
  'auto-backup-cron-configured',
  0,
  'Daily backup cron job successfully configured at ' || NOW()::TEXT
);

-- ============================================
-- 確認用クエリ（実行後に確認してください）
-- ============================================

-- cronジョブの確認
SELECT * FROM cron.job WHERE jobname = 'daily-backup-job';

-- backup_history テーブルの確認
SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 5;

-- ============================================
-- トラブルシューティング
-- ============================================

-- cronジョブを手動で削除する場合:
-- SELECT cron.unschedule('daily-backup-job');

-- cronジョブを手動で実行してテストする場合:
-- SELECT net.http_post(
--   url := 'https://jhjexgkzzbzxhhlezaoa.supabase.co/functions/v1/daily-backup',
--   headers := '{"Content-Type": "application/json"}'::jsonb
-- );

-- 全てのcronジョブを確認:
-- SELECT * FROM cron.job;

-- cronジョブの実行履歴を確認:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
