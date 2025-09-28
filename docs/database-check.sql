-- task_templatesテーブルの列構造を確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'task_templates'
ORDER BY ordinal_position;

-- 特に追加予定の列があるかチェック
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_templates' AND column_name = 'client_id')
        THEN '✅ client_id column exists'
        ELSE '❌ client_id column missing - MUST ADD!'
    END as client_id_status,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_templates' AND column_name = 'reference_url')
        THEN '✅ reference_url column exists'
        ELSE '❌ reference_url column missing - MUST ADD!'
    END as reference_url_status,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_templates' AND column_name = 'default_assignee_id')
        THEN '✅ default_assignee_id column exists'
        ELSE '❌ default_assignee_id column missing - MUST ADD!'
    END as default_assignee_id_status;