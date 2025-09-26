  -- 重要度列を追加（1:低、2:中、3:高、デフォルト値は2:中）
  ALTER TABLE tasks
  ADD COLUMN priority INTEGER DEFAULT 2 CHECK (priority IN (1, 2, 3));

  -- 作業予定日列を追加
  ALTER TABLE tasks
  ADD COLUMN work_date DATE;

  -- 既存データの重要度をデフォルト値に設定（念のため）
  UPDATE tasks SET priority = 2 WHERE priority IS NULL;

  -- インデックスを追加（検索・ソートの高速化）
  CREATE INDEX idx_tasks_priority ON tasks(priority);
  CREATE INDEX idx_tasks_work_date ON tasks(work_date);