-- 週次進捗スナップショットテーブルの作成
CREATE TABLE weekly_progress_snapshots (
  id SERIAL PRIMARY KEY,
  week_date DATE NOT NULL,           -- 週の開始日（月曜日）
  client_id INTEGER REFERENCES clients(id),
  staff_id INTEGER REFERENCES staffs(id),
  progress_rate DECIMAL(5,2),        -- 週の進捗率
  completed_tasks INTEGER,           -- 完了タスク数
  total_tasks INTEGER,               -- 総タスク数
  fiscal_month INTEGER,              -- 決算月
  client_name TEXT,                  -- クライアント名（非正規化）
  staff_name TEXT,                   -- 担当者名（非正規化）
  created_at TIMESTAMP DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_weekly_snapshots_week_date ON weekly_progress_snapshots(week_date);
CREATE INDEX idx_weekly_snapshots_client_id ON weekly_progress_snapshots(client_id);
CREATE INDEX idx_weekly_snapshots_staff_id ON weekly_progress_snapshots(staff_id);
CREATE INDEX idx_weekly_snapshots_fiscal_month ON weekly_progress_snapshots(fiscal_month);

-- RLS（Row Level Security）ポリシーの設定
ALTER TABLE weekly_progress_snapshots ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーに対する全権限を付与
CREATE POLICY "Allow authenticated users to access weekly_progress_snapshots" ON weekly_progress_snapshots
FOR ALL USING (auth.role() = 'authenticated');

-- 匿名ユーザーに対する読み取り権限を付与（必要に応じて）
CREATE POLICY "Allow anon users to read weekly_progress_snapshots" ON weekly_progress_snapshots
FOR SELECT USING (true);
