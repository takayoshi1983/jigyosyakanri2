-- タスク管理テーブルに終了日カラムを追加
-- 作成日: 2025-10-05
-- 目的: ガントチャートでのドラッグリサイズによる期間調整を保存

ALTER TABLE tasks
ADD COLUMN end_date DATE;

COMMENT ON COLUMN tasks.end_date IS '作業終了日（ガントチャートでの調整後の値）。NULLの場合はestimated_time_hoursから自動計算';

-- インデックスを追加（検索・ソートの高速化）
CREATE INDEX idx_tasks_end_date ON tasks(end_date);
