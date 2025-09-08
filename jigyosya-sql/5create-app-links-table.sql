-- 「その他アプリ」のURLリンクを保存するためのテーブルを作成します。
CREATE TABLE app_links (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 新しいテーブルへのアクセス権限を有効にします。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_links TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app_links_id_seq TO authenticated;
