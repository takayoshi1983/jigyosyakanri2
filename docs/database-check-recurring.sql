-- recurring_tasksテーブルの列構造を確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'recurring_tasks'
ORDER BY ordinal_position;

-- display_order列があるかチェック
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_tasks' AND column_name = 'display_order')
        THEN '✅ display_order column exists'
        ELSE '❌ display_order column missing - MUST ADD!'
    END as display_order_status;