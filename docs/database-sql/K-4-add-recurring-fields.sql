-- recurring_tasksテーブルに不足している列を追加
-- 作成日: 2025-09-29
-- 目的: 月次自動タスクの機能拡張

-- 1. create_days_before列を追加（何日前に作成するか）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recurring_tasks' AND column_name = 'create_days_before') THEN
        ALTER TABLE recurring_tasks ADD COLUMN create_days_before INTEGER DEFAULT 3;
        RAISE NOTICE 'create_days_before column added successfully';
    ELSE
        RAISE NOTICE 'create_days_before column already exists, skipping add';
    END IF;
END $$;

-- 2. due_day列を追加（期限日）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recurring_tasks' AND column_name = 'due_day') THEN
        ALTER TABLE recurring_tasks ADD COLUMN due_day INTEGER DEFAULT 25;
        RAISE NOTICE 'due_day column added successfully';
    ELSE
        RAISE NOTICE 'due_day column already exists, skipping add';
    END IF;
END $$;

-- 3. display_order列を追加（並び替え用、オプション）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recurring_tasks' AND column_name = 'display_order') THEN
        ALTER TABLE recurring_tasks ADD COLUMN display_order INTEGER DEFAULT 0;
        RAISE NOTICE 'display_order column added successfully';
    ELSE
        RAISE NOTICE 'display_order column already exists, skipping add';
    END IF;
END $$;

-- 4. インデックス追加（存在しない場合のみ）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'recurring_tasks' AND indexname = 'idx_recurring_tasks_display_order') THEN
        CREATE INDEX idx_recurring_tasks_display_order ON recurring_tasks(display_order);
        RAISE NOTICE 'display_order index created successfully';
    ELSE
        RAISE NOTICE 'display_order index already exists, skipping creation';
    END IF;
END $$;

-- 5. コメント追加
COMMENT ON COLUMN recurring_tasks.create_days_before IS '期限日の何日前にタスクを作成するか';
COMMENT ON COLUMN recurring_tasks.due_day IS '毎月の期限日（1-31）';
COMMENT ON COLUMN recurring_tasks.display_order IS '表示順序（ドラッグ&ドロップ用）';

-- 6. 最終確認クエリ
SELECT
    'recurring_tasks table fields updated successfully!' as status,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'recurring_tasks' AND column_name = 'create_days_before') as create_days_before_exists,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'recurring_tasks' AND column_name = 'due_day') as due_day_exists,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'recurring_tasks' AND column_name = 'display_order') as display_order_exists;