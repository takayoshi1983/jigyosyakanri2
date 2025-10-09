// GitHub Actions用 自動バックアップスクリプト
// 毎日0:00 JSTに実行され、Supabase Storageにバックアップを保存

import { createClient } from '@supabase/supabase-js';

// 環境変数から取得（GitHub Secretsから渡される）
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

// Supabaseクライアント初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 日本時間を取得
function getJapanTime() {
  const now = new Date();
  // UTCから9時間追加してJSTに変換
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + jstOffset);
}

// 曜日名を取得
function getDayOfWeek(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getUTCDay()];
}

// メイン処理
async function runBackup() {
  try {
    console.log('🔄 Starting daily automatic backup...');

    const jstDate = getJapanTime();
    const dayOfWeek = getDayOfWeek(jstDate);
    const timestamp = jstDate.toISOString();

    console.log(`📅 Japan Time: ${jstDate.toISOString()}`);
    console.log(`📅 Day of Week: ${dayOfWeek}`);

    // バックアップするテーブルのリスト
    const tables = ['clients', 'staffs', 'monthly_tasks', 'editing_sessions', 'settings', 'default_tasks', 'app_links'];

    const backupData = {
      timestamp,
      version: '1.0',
      database: 'jigyosya-management',
      tables: {}
    };

    let totalRecords = 0;

    // 各テーブルからデータを取得
    for (const tableName of tables) {
      console.log(`📊 Backing up table: ${tableName}`);

      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (error) {
        console.error(`❌ Error fetching ${tableName}:`, error.message);
        // エラーがあっても続行（テーブルが存在しない場合など）
        backupData.tables[tableName] = [];
        continue;
      }

      backupData.tables[tableName] = data || [];
      const recordCount = data?.length || 0;
      totalRecords += recordCount;
      console.log(`✅ ${tableName}: ${recordCount} records`);
    }

    console.log(`📈 Total records: ${totalRecords}`);

    // JSONに変換
    const jsonContent = JSON.stringify(backupData, null, 2);
    const fileSizeKB = Math.round(Buffer.byteLength(jsonContent, 'utf8') / 1024);

    console.log(`📦 Backup size: ${fileSizeKB} KB`);

    // ファイル名とパス（週次ローテーション）
    const fileName = `jigyosya-backup-${dayOfWeek}.json`;
    const filePath = `weekly/${dayOfWeek}/${fileName}`;

    console.log(`☁️ Uploading backup to: ${filePath}`);

    // 既存ファイルを削除（エラーは無視）
    await supabase.storage.from('backups').remove([filePath]);

    // Supabase Storageにアップロード
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('backups')
      .upload(filePath, jsonContent, {
        contentType: 'application/json',
        upsert: false  // 新規アップロード
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError.message);

      // エラーをbackup_historyに記録
      await supabase
        .from('backup_history')
        .insert({
          backup_type: 'auto',
          status: 'failed',
          file_name: fileName,
          total_records: totalRecords,
          error_message: uploadError.message
        });

      process.exit(1);
    }

    console.log('✅ Backup uploaded successfully');

    // レポートデータ作成
    const reportData = {
      timestamp,
      backupFileName: fileName,
      totalRecords,
      tableStats: Object.entries(backupData.tables).map(([name, records]) => ({
        table: name,
        records: Array.isArray(records) ? records.length : 0
      })),
      fileSizeKB,
      status: 'success'
    };

    // レポートファイルをアップロード
    const reportFileName = `jigyosya-backup-report-${dayOfWeek}.json`;
    const reportPath = `weekly/${dayOfWeek}/${reportFileName}`;

    // 既存レポートファイルを削除（エラーは無視）
    await supabase.storage.from('backups').remove([reportPath]);

    await supabase
      .storage
      .from('backups')
      .upload(reportPath, JSON.stringify(reportData, null, 2), {
        contentType: 'application/json',
        upsert: false
      });

    console.log('✅ Report uploaded successfully');

    // backup_historyテーブルに記録
    const { error: historyError } = await supabase
      .from('backup_history')
      .insert({
        backup_type: 'auto',
        status: 'completed',
        file_name: fileName,
        file_size_kb: fileSizeKB,
        total_records: totalRecords,
        error_message: null
      });

    if (historyError) {
      console.warn('⚠️ Warning: Could not record backup history:', historyError.message);
      // バックアップ自体は成功しているので、エラーにはしない
    } else {
      console.log('📝 Backup history recorded successfully');
    }

    console.log('🎉 Daily backup completed successfully!');
    console.log(`📊 Summary: ${totalRecords} records, ${fileSizeKB} KB`);

  } catch (error) {
    console.error('💥 Backup failed:', error.message);
    process.exit(1);
  }
}

// 実行
runBackup();
