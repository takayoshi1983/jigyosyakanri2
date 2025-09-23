-- monthly_tasks テーブルに completed カラムを追加します。
-- デフォルト値は false に設定し、NULLを許可しないようにします。
ALTER TABLE monthly_tasks
ADD COLUMN completed BOOLEAN NOT NULL DEFAULT false;
