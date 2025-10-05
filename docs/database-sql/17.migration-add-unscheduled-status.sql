-- tasksテーブルのstatusカラムに「予定未定」を追加
-- 既存のステータス: '依頼中', '作業完了', '確認完了'

-- 1. statusカラムの制約を確認（既にCHECK制約がある場合は削除）
-- ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- 2. 新しいCHECK制約を追加（「予定未定」を含む）
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('予定未定', '依頼中', '作業完了', '確認完了'));

-- 3. 既存の随時タスク（is_anytime=true かつ work_date=null）を「予定未定」に更新
UPDATE tasks
SET status = '予定未定'
WHERE is_anytime = true
  AND work_date IS NULL
  AND status = '依頼中';

-- 4. 確認用クエリ
SELECT status, COUNT(*)
FROM tasks
GROUP BY status
ORDER BY status;
