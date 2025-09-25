-- テンプレートに担当者機能を追加
-- K-2.template-staff-update.sql

-- 1. task_templatesテーブルに列を追加
ALTER TABLE task_templates
ADD COLUMN staff_id INTEGER REFERENCES staffs(id),
ADD COLUMN is_global BOOLEAN DEFAULT FALSE;

-- 2. 既存のデータをグローバルテンプレートに設定
UPDATE task_templates SET is_global = true WHERE staff_id IS NULL;

-- 3. インデックス追加（パフォーマンス向上）
CREATE INDEX idx_task_templates_staff_id ON task_templates(staff_id);
CREATE INDEX idx_task_templates_global ON task_templates(is_global);

-- 4. RLS (Row Level Security) ポリシー更新
-- 既存のポリシーを削除して新しいポリシーを作成
DROP POLICY IF EXISTS "Users can view all task templates" ON task_templates;
DROP POLICY IF EXISTS "Users can insert task templates" ON task_templates;
DROP POLICY IF EXISTS "Users can update task templates" ON task_templates;
DROP POLICY IF EXISTS "Users can delete task templates" ON task_templates;

-- 新しいポリシー：グローバルテンプレート + 自分のテンプレートを表示
CREATE POLICY "Users can view accessible templates" ON task_templates
    FOR SELECT USING (
        is_global = true
        OR staff_id = (
            SELECT id FROM staffs
            WHERE email = auth.jwt() ->> 'email'
        )
    );

-- 個人テンプレートの作成権限
CREATE POLICY "Users can insert personal templates" ON task_templates
    FOR INSERT WITH CHECK (
        staff_id = (
            SELECT id FROM staffs
            WHERE email = auth.jwt() ->> 'email'
        )
        AND is_global = false
    );

-- 自分のテンプレートのみ更新可能
CREATE POLICY "Users can update own templates" ON task_templates
    FOR UPDATE USING (
        staff_id = (
            SELECT id FROM staffs
            WHERE email = auth.jwt() ->> 'email'
        )
    );

-- 自分のテンプレートのみ削除可能
CREATE POLICY "Users can delete own templates" ON task_templates
    FOR DELETE USING (
        staff_id = (
            SELECT id FROM staffs
            WHERE email = auth.jwt() ->> 'email'
        )
    );

-- 5. コメント追加
COMMENT ON COLUMN task_templates.staff_id IS '担当者ID（NULL = グローバルテンプレート）';
COMMENT ON COLUMN task_templates.is_global IS 'グローバルテンプレートフラグ（全員が使用可能）';