-- ===============================================
-- 事業者管理アプリ - Supabase完全クリーンセットアップ
-- ===============================================

-- 既存テーブル削除（順序重要）
DROP TABLE IF EXISTS monthly_tasks CASCADE;
DROP TABLE IF EXISTS editing_sessions CASCADE;  
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS staffs CASCADE;
DROP TABLE IF EXISTS default_tasks CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- ===============================================
-- テーブル作成
-- ===============================================

-- 1. スタッフテーブル
CREATE TABLE staffs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(100) DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. クライアントテーブル  
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    fiscal_month INTEGER CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
    staff_id INTEGER REFERENCES staffs(id),
    accounting_method VARCHAR(100) DEFAULT '記帳代行',
    status VARCHAR(50) DEFAULT 'active',
    custom_tasks_by_year JSONB DEFAULT '{}',
    finalized_years JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 月次タスクテーブル
CREATE TABLE monthly_tasks (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    month VARCHAR(10) NOT NULL, -- 'YYYY-MM' format
    tasks JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    url TEXT,
    memo TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(client_id, month)
);

-- 4. 設定テーブル
CREATE TABLE settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. デフォルトタスクテーブル
CREATE TABLE default_tasks (
    id SERIAL PRIMARY KEY,
    task_name VARCHAR(255),
    accounting_method VARCHAR(100),
    tasks JSONB,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 編集セッションテーブル（悲観ロック用）
CREATE TABLE editing_sessions (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW()
);

-- ===============================================
-- インデックス作成
-- ===============================================
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_staff ON clients(staff_id);  
CREATE INDEX idx_monthly_tasks_client ON monthly_tasks(client_id);
CREATE INDEX idx_monthly_tasks_month ON monthly_tasks(month);
CREATE INDEX idx_editing_sessions_client ON editing_sessions(client_id);
CREATE INDEX idx_editing_sessions_activity ON editing_sessions(last_activity);

-- ===============================================
-- 初期データ投入
-- ===============================================

-- スタッフデータ
INSERT INTO staffs (name, email, role) VALUES
('田中太郎', 'tanaka@example.com', 'manager'),
('佐藤花子', 'sato@example.com', 'staff'),
('鈴木一郎', 'suzuki@example.com', 'staff'),
('山田美咲', 'yamada@example.com', 'staff');

-- 設定データ
INSERT INTO settings (key, value) VALUES
('yellow_threshold', '7'),
('red_threshold', '3'),
('yellow_color', '"#FFFF99"'),
('red_color', '"#FFB6C1"'),
('font_family', '"Arial, sans-serif"'),
('hide_inactive_clients', 'false');

-- デフォルトタスクデータ
INSERT INTO default_tasks (accounting_method, tasks, task_name, display_order) VALUES
('記帳代行', '["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]', '記帳代行セット', 999),
('自計', '["データ受領", "担当チェック", "不明投げかけ", "月次完了"]', '自計セット', 998);

-- サンプルクライアントデータ
INSERT INTO clients (name, fiscal_month, staff_id, accounting_method, custom_tasks_by_year) VALUES
('株式会社サンプル商事', 3, 1, '記帳代行', '{"2025": ["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]}'),
('田中商店', 12, 2, '自計', '{"2025": ["データ受領", "担当チェック", "不明投げかけ", "月次完了"]}'),
('山田工業株式会社', 3, 3, '記帳代行', '{"2025": ["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]}'),
('佐藤建設', 12, 1, '記帳代行', '{"2025": ["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]}'),
('鈴木製作所', 9, 4, '記帳代行', '{"2025": ["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]}');

-- ===============================================
-- RLS（Row Level Security）設定 - 無効化
-- ===============================================
ALTER TABLE staffs DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;  
ALTER TABLE monthly_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE default_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE editing_sessions DISABLE ROW LEVEL SECURITY;

-- ===============================================
-- 権限設定 - 匿名ユーザーにフルアクセス許可
-- ===============================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- 完了メッセージ
SELECT 'Supabase clean setup completed successfully!' as status;