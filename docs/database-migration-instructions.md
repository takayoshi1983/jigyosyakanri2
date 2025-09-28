# データベースマイグレーション手順

## K-3.add-template-fields.sql の実行

新しいテンプレートフィールド（事業者名、参照URL、既定の受託者）を追加するためのマイグレーションです。

### 実行方法

1. **Supabaseダッシュボード** にアクセス
2. **SQL Editor** を開く
3. `docs/database-sql/K-3.add-template-fields.sql` の内容をコピー&ペースト
4. **Run** ボタンをクリックして実行

### 追加される列

```sql
-- task_templatesテーブルに追加される列
client_name TEXT             -- 対象事業者名（任意）
reference_url TEXT           -- 参照URL（任意）
default_assignee_id BIGINT   -- 既定の受託者ID（任意）
```

### 実行後の確認

```sql
-- 列が正しく追加されたかを確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'task_templates'
  AND column_name IN ('client_name', 'reference_url', 'default_assignee_id');
```

### 注意事項

- 既存データには影響しません（全て NULL 許可）
- インデックスも自動で作成されます
- Foreign Key制約により、無効な staff_id は設定できません

実行完了後、アプリケーションを再読み込みして新機能をお試しください。