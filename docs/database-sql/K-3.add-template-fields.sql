-- task_templatesテーブルに不足している列を追加
-- 作成日: 2025-09-29
-- 目的: テンプレート機能拡張（事業者名、参照URL、既定の受託者）

-- 1. 新しい列を追加
ALTER TABLE task_templates
ADD COLUMN client_name TEXT,
ADD COLUMN reference_url TEXT,
ADD COLUMN default_assignee_id BIGINT REFERENCES staffs(id);

-- 2. インデックス追加（パフォーマンス向上）
CREATE INDEX idx_task_templates_default_assignee ON task_templates(default_assignee_id);

-- 3. コメント追加（ドキュメント）
COMMENT ON COLUMN task_templates.client_name IS '対象事業者名（任意）';
COMMENT ON COLUMN task_templates.reference_url IS '参照URL（任意）';
COMMENT ON COLUMN task_templates.default_assignee_id IS '既定の受託者ID（任意）';

-- 4. 既存データの説明フィールドから事業者名・参照URLを抽出して移行（オプション）
-- 以下は手動実行が推奨されます
-- UPDATE task_templates
-- SET client_name = CASE
--     WHEN description ~ '事業者名:\s*(.+)' THEN
--         trim(regexp_replace(description, '.*事業者名:\s*([^\n]+).*', '\1', 'gs'))
--     ELSE NULL
-- END,
-- reference_url = CASE
--     WHEN description ~ '参照URL:\s*(https?://[^\s\n]+)' THEN
--         trim(regexp_replace(description, '.*参照URL:\s*(https?://[^\s\n]+).*', '\1', 'gs'))
--     ELSE NULL
-- END
-- WHERE description IS NOT NULL
--   AND (description ~ '事業者名:' OR description ~ '参照URL:');

-- 5. 完了メッセージ
SELECT 'task_templates table fields added successfully!' as status;