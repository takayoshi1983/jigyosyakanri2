-- タスク管理アプリ用データベーステーブル作成
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. tasks テーブル（メインのタスク管理テーブル）
CREATE TABLE tasks (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES clients(id),
    assignee_id BIGINT REFERENCES staffs(id),
    requester_id BIGINT REFERENCES staffs(id),
    task_name TEXT NOT NULL,
    description TEXT,
    reference_url TEXT,
    due_date DATE,
    estimated_time_hours NUMERIC(5,2),
    completed_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    status TEXT DEFAULT '依頼中' CHECK (status IN ('依頼中', '作業完了', '確認完了')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. task_templates テーブル（タスクテンプレート）
CREATE TABLE task_templates (
    id BIGSERIAL PRIMARY KEY,
    template_name TEXT NOT NULL,
    task_name TEXT,
    description TEXT,
    estimated_time_hours NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. recurring_tasks テーブル（ルーティンタスク設定）
CREATE TABLE recurring_tasks (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT REFERENCES task_templates(id),
    client_id BIGINT REFERENCES clients(id),
    assignee_id BIGINT REFERENCES staffs(id),
    frequency_type TEXT CHECK (frequency_type IN ('monthly', 'weekly', 'daily')),
    frequency_day INTEGER, -- 毎月25日なら25、毎週月曜なら1
    is_active BOOLEAN DEFAULT TRUE,
    next_run_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. task_comments テーブル（タスクコメント・履歴）
CREATE TABLE task_comments (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES staffs(id),
    comment TEXT NOT NULL,
    comment_type TEXT DEFAULT 'comment' CHECK (comment_type IN ('comment', 'status_change', 'system')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成（パフォーマンス最適化）
CREATE INDEX idx_tasks_client_id ON tasks(client_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_requester_id ON tasks(requester_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);

-- RLS (Row Level Security) 設定
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー作成（認証済みユーザーのみアクセス可能）
CREATE POLICY "Enable all operations for authenticated users" ON tasks
    FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable all operations for authenticated users" ON task_templates
    FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable all operations for authenticated users" ON recurring_tasks
    FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable all operations for authenticated users" ON task_comments
    FOR ALL USING (auth.uid() IS NOT NULL);

-- updated_at の自動更新用トリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_at トリガー設定
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_task_templates_updated_at BEFORE UPDATE ON task_templates
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_recurring_tasks_updated_at BEFORE UPDATE ON recurring_tasks
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 初期データ投入（テスト用タスクテンプレート）
INSERT INTO task_templates (template_name, task_name, description, estimated_time_hours) VALUES
('月次記帳', '月次記帳作業', '売上・経費の記帳、仕訳確認', 2.0),
('決算準備', '決算書類準備', '決算に必要な書類の準備・確認', 4.0),
('給与計算', '給与計算・支給', '月次給与計算と支給処理', 1.5),
('税務申告', '法人税申告書作成', '法人税申告書の作成・提出', 3.0);