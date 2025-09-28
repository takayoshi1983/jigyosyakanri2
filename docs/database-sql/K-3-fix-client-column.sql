-- 緊急修正: task_templatesテーブルのclient列を正しく設定
-- 作成日: 2025-09-29
-- 目的: client_nameをclient_idに変更（正しい外部キー設定）

-- 1. 既存のclient_name列があれば削除
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'task_templates' AND column_name = 'client_name') THEN
        ALTER TABLE task_templates DROP COLUMN client_name;
        RAISE NOTICE 'client_name column dropped successfully';
    ELSE
        RAISE NOTICE 'client_name column does not exist, skipping drop';
    END IF;
END $$;

-- 2. client_id列を追加（まだ存在しない場合のみ）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'task_templates' AND column_name = 'client_id') THEN
        ALTER TABLE task_templates ADD COLUMN client_id BIGINT REFERENCES clients(id);
        RAISE NOTICE 'client_id column added successfully';
    ELSE
        RAISE NOTICE 'client_id column already exists, skipping add';
    END IF;
END $$;

-- 3. reference_url列を追加（まだ存在しない場合のみ）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'task_templates' AND column_name = 'reference_url') THEN
        ALTER TABLE task_templates ADD COLUMN reference_url TEXT;
        RAISE NOTICE 'reference_url column added successfully';
    ELSE
        RAISE NOTICE 'reference_url column already exists, skipping add';
    END IF;
END $$;

-- 4. default_assignee_id列を追加（まだ存在しない場合のみ）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'task_templates' AND column_name = 'default_assignee_id') THEN
        ALTER TABLE task_templates ADD COLUMN default_assignee_id BIGINT REFERENCES staffs(id);
        RAISE NOTICE 'default_assignee_id column added successfully';
    ELSE
        RAISE NOTICE 'default_assignee_id column already exists, skipping add';
    END IF;
END $$;

-- 5. インデックス追加（存在しない場合のみ）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'task_templates' AND indexname = 'idx_task_templates_client_id') THEN
        CREATE INDEX idx_task_templates_client_id ON task_templates(client_id);
        RAISE NOTICE 'client_id index created successfully';
    ELSE
        RAISE NOTICE 'client_id index already exists, skipping creation';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'task_templates' AND indexname = 'idx_task_templates_default_assignee') THEN
        CREATE INDEX idx_task_templates_default_assignee ON task_templates(default_assignee_id);
        RAISE NOTICE 'default_assignee_id index created successfully';
    ELSE
        RAISE NOTICE 'default_assignee_id index already exists, skipping creation';
    END IF;
END $$;

-- 6. コメント追加
COMMENT ON COLUMN task_templates.client_id IS '対象事業者ID（任意、clients.idへの外部キー）';
COMMENT ON COLUMN task_templates.reference_url IS '参照URL（任意）';
COMMENT ON COLUMN task_templates.default_assignee_id IS '既定の受託者ID（任意、staffs.idへの外部キー）';

-- 7. 最終確認クエリ
SELECT
    'task_templates table structure updated successfully!' as status,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'task_templates' AND column_name = 'client_id') as client_id_exists,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'task_templates' AND column_name = 'reference_url') as reference_url_exists,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'task_templates' AND column_name = 'default_assignee_id') as default_assignee_id_exists;