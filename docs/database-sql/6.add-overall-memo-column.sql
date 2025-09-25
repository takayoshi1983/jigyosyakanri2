-- clients テーブルに overall_memo 列を追加
-- 全体メモ機能を有効にするためのデータベース変更

-- 1. overall_memo 列を追加（TEXT型、デフォルト値は空文字列）
ALTER TABLE clients 
ADD COLUMN overall_memo TEXT DEFAULT '';

-- 2. 既存データに空文字列を設定（NULL対策）
UPDATE clients 
SET overall_memo = ''
WHERE overall_memo IS NULL;

-- 3. 列が正常に追加されたかを確認
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'clients' 
AND column_name = 'overall_memo';

-- 実行完了後の確認コマンド
-- SELECT id, name, overall_memo FROM clients LIMIT 5;