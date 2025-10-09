# 自動バックアップシステム セットアップガイド

このガイドでは、事業者管理アプリの自動バックアップシステムをGitHub Actionsで設定する手順を説明します。

## システム概要

- **GitHub Actions自動バックアップ**: 毎日0:00 JST（15:00 UTC前日）に自動実行（完全無料）
- **クライアントサイド手動バックアップ**: 緊急時に手動でローカルバックアップ可能
- **週次ローテーション**: 曜日ごとのフォルダに保存（Sunday～Saturday）
- **バックアップ履歴管理**: `backup_history`テーブルで履歴を追跡

## 前提条件

✅ GitHubアカウント（無料プランでOK）
✅ GitHubリポジトリ（パブリック/プライベート両方OK）
✅ Supabase 無料プラン以上
✅ Storage の `backups` バケットが作成されていること

## GitHub Actions方式のメリット

- 💰 **完全無料**: Supabase無料プランでも利用可能
- 🔒 **安全**: GitHub Secretsで暗号化保存
- ⏰ **確実**: ブラウザを開かなくても自動実行
- ☁️ **クラウド保存**: Supabase Storageに保存

## セットアップ手順

### Step 1: GitHubリポジトリの準備

このプロジェクトをGitHubリポジトリにプッシュしてください（まだの場合）。

```bash
git add .
git commit -m "Add automatic backup system"
git push origin main
```

### Step 2: GitHub Secretsの設定

1. GitHubリポジトリページを開く
2. **Settings** > **Secrets and variables** > **Actions** をクリック
3. **New repository secret** をクリックして以下を追加:

#### Secret 1: SUPABASE_URL
- **Name**: `SUPABASE_URL`
- **Value**: `https://jhjexgkzzbzxhhlezaoa.supabase.co`

#### Secret 2: SUPABASE_ANON_KEY
- **Name**: `SUPABASE_ANON_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoamV4Z2t6emJ6eGhobGV6YW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDUyMzAsImV4cCI6MjA3MjIyMTIzMH0.So1WcCBUEV-mMQu6_k-xRdNn3XDLwGxcCzDT3L402EQ`

⚠️ **重要**: これらの値はGitHub Secretsに保存され、暗号化されます。コードには絶対に直接書かないでください。

### Step 3: backup_history テーブルの作成

Supabase Dashboard > SQL Editor で以下のSQLを実行:

```sql
-- backup_history テーブルを作成
CREATE TABLE IF NOT EXISTS backup_history (
  id BIGSERIAL PRIMARY KEY,
  backup_date TIMESTAMPTZ DEFAULT NOW(),
  backup_type TEXT DEFAULT 'auto',
  status TEXT DEFAULT 'pending',
  file_name TEXT,
  file_size_kb INTEGER,
  total_records INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_backup_history_date ON backup_history(backup_date DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);

-- RLS有効化
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- RLSポリシー作成
CREATE POLICY "Allow authenticated users to view backup history"
  ON backup_history FOR SELECT
  USING (auth.role() = 'authenticated');
```

### Step 4: Storage バケットの確認

1. **Supabase Dashboard** > **Storage** を開く
2. `backups` バケットが存在することを確認
3. バケットのポリシーを確認:
   - **authenticated** ユーザーに読み書き権限があることを確認
   - または、**Public** に設定（必要に応じて）

### Step 5: GitHub Actionsの有効化

1. GitHubリポジトリページで **Actions** タブをクリック
2. ワークフローが表示されたら有効化
3. 初回は手動で実行してテスト:
   - **Actions** タブ > **Daily Automatic Backup** を選択
   - **Run workflow** をクリック
   - **Run workflow** ボタンを押して実行

### Step 6: 動作確認

#### 方法1: GitHub Actionsのログ確認

1. **Actions** タブを開く
2. 最新の実行をクリック
3. **backup** ジョブをクリック
4. ログを確認:
   - ✅ バックアップが成功していることを確認
   - ✅ アップロード完了メッセージを確認

#### 方法2: Supabase Storageで確認

1. **Supabase Dashboard** > **Storage** > **backups** を開く
2. `weekly/[曜日]/` フォルダにバックアップファイルが作成されていることを確認
3. ファイル形式: `jigyosya-backup-[曜日].json`

#### 方法3: backup_historyテーブルで確認

```sql
SELECT * FROM backup_history
ORDER BY created_at DESC
LIMIT 10;
```

## トラブルシューティング

### GitHub Actionsが実行されない場合

1. **Actions** タブが有効か確認
2. GitHub Secretsが正しく設定されているか確認:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. ワークフローファイルが正しい場所にあるか確認:
   - `.github/workflows/daily-backup.yml`

### バックアップがエラーになる場合

1. GitHub Actionsのログを確認:
   - **Actions** タブ > 失敗した実行をクリック
   - エラーメッセージを確認

2. よくあるエラー:
   - `403 Forbidden`: Storage のRLSポリシーを確認
   - `404 Not Found`: テーブル名が正しいか確認
   - `Network Error`: Supabase URLが正しいか確認

3. 手動でテーブルにアクセスできるか確認:
   ```sql
   SELECT * FROM clients LIMIT 1;
   SELECT * FROM staffs LIMIT 1;
   ```

### Secretsの更新方法

1. **Settings** > **Secrets and variables** > **Actions**
2. 更新したいSecretの右側の **Update** をクリック
3. 新しい値を入力して **Update secret**

## 手動バックアップ機能

クライアントサイドの手動バックアップ機能は引き続き利用可能です:

1. アプリにログイン
2. 管理メニュー > データバックアップ を開く
3. 「バックアップ実行」ボタンをクリック

または、ブラウザコンソールで:
```javascript
// バックアップ状態確認
window.debugBackup.status()

// 手動バックアップ実行
window.debugBackup.test()
```

## バックアップスケジュール

| 時刻（JST） | 時刻（UTC） | 処理内容 |
|------------|------------|---------|
| 0:00       | 15:00（前日）| 自動バックアップ実行 |

## バックアップファイル構造

```
backups/
├── weekly/
│   ├── Sunday/
│   │   ├── jigyosya-backup-Sunday.json
│   │   └── jigyosya-backup-report-Sunday.json
│   ├── Monday/
│   │   ├── jigyosya-backup-Monday.json
│   │   └── jigyosya-backup-report-Monday.json
│   ├── Tuesday/
│   ├── Wednesday/
│   ├── Thursday/
│   ├── Friday/
│   └── Saturday/
```

各曜日のフォルダには、その曜日に実行されたバックアップが上書き保存されます（週次ローテーション）。

## セキュリティ注意事項

⚠️ `SUPABASE_SERVICE_ROLE_KEY` は絶対に公開しないでください
⚠️ RLSポリシーが正しく設定されていることを確認してください
⚠️ バックアップファイルには機密情報が含まれる可能性があります

## 自動実行スケジュール

GitHub Actionsは以下のスケジュールで自動実行されます:

| 時刻（JST） | 時刻（UTC） | 処理内容 |
|------------|------------|---------|
| 0:00       | 15:00（前日）| 自動バックアップ実行 |

- **cron式**: `0 15 * * *`（毎日15:00 UTC = 翌日0:00 JST）
- **手動実行**: いつでも **Actions** タブから手動実行可能

## 関連ファイル

- `.github/workflows/daily-backup.yml` - GitHub Actionsワークフロー定義
- `.github/scripts/backup.js` - バックアップスクリプト本体
- `supabase-client.js` - クライアントサイド手動バックアップ機能
- `.gitignore` - 機密情報保護設定

## セキュリティベストプラクティス

✅ **GitHub Secretsを使用**: URLとキーはSecretsに保存
✅ **.gitignore設定済み**: `.env`, `*.key`, `secrets/` を除外
✅ **anon keyを使用**: service_role_keyではなくanon keyを使用
✅ **RLS有効化**: テーブルにRow Level Securityを適用

## サポート

問題が発生した場合は、以下を確認してください:
1. GitHub Actions の実行ログ
2. Supabase Storage の権限設定
3. `backup_history` テーブルの `error_message` カラム
