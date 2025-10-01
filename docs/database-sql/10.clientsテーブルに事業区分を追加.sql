-- clientsテーブルに事業者区分列を追加
ALTER TABLE clients 
ADD COLUMN business_type VARCHAR(10) DEFAULT '法人' CHECK (business_type IN ('法人', '個人事業'));

-- 既存の全てのクライアントを「法人」に設定
--UPDATE clients 
--SET business_type = '法人' 
--WHERE business_type IS NULL;

-- デフォルト値を設定（今後の新規登録時は「法人」がデフォルト）
ALTER TABLE clients 
ALTER COLUMN business_type SET DEFAULT '法人';