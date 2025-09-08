-- ===============================================
-- monthly_tasksテーブルにtask_memosカラムを追加
-- ===============================================

-- task_memosカラムを追加（JSONBタイプでデフォルト値は空のオブジェクト）
ALTER TABLE monthly_tasks 
ADD COLUMN IF NOT EXISTS task_memos JSONB DEFAULT '{}';

-- インデックスを追加（検索性能向上のため）
CREATE INDEX IF NOT EXISTS idx_monthly_tasks_task_memos 
ON monthly_tasks USING GIN (task_memos);

-- 既存レコードのtask_memosを空のオブジェクトに初期化
UPDATE monthly_tasks 
SET task_memos = '{}' 
WHERE task_memos IS NULL;

-- 確認用クエリ
SELECT 
    client_id,
    month,
    tasks,
    task_memos,
    created_at
FROM monthly_tasks 
LIMIT 5;

-- 完了メッセージ
SELECT 'task_memos column added successfully to monthly_tasks table!' as status;