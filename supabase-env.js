// Supabase環境設定
// Vercelで環境変数を設定した場合、このファイルを通して管理

console.log('[Supabase Env] Loading configuration...');

export const SUPABASE_CONFIG = {
    // 本番環境ではVercel環境変数から設定される
    // 開発環境では以下の値を使用
    url: 'https://lqwjmlkkdddjnnxnlyfz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxd2ptbGtrZGRkam5ueG5seWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyOTI2MjMsImV4cCI6MjA3MTg2ODYyM30.U9OndAw71LEQrYA7KBmBRfmNVtISVDBMvhm8s11wKfg'
};

// Vercel環境変数があれば上書き（将来の拡張用）
let envVarsUsed = false;
if (typeof window !== 'undefined') {
    if (window.SUPABASE_URL) {
        console.log('[Supabase Env] Using environment variable for URL');
        SUPABASE_CONFIG.url = window.SUPABASE_URL;
        envVarsUsed = true;
    }
    if (window.SUPABASE_ANON_KEY) {
        console.log('[Supabase Env] Using environment variable for ANON_KEY');
        SUPABASE_CONFIG.anonKey = window.SUPABASE_ANON_KEY;
        envVarsUsed = true;
    }
}

console.log('[Supabase Env] Configuration loaded:', {
    url: SUPABASE_CONFIG.url.substring(0, 30) + '...',
    anonKeyPrefix: SUPABASE_CONFIG.anonKey.substring(0, 20) + '...',
    environmentVariablesUsed: envVarsUsed
});