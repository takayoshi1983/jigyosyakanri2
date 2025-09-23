// 環境設定ファイル - Vercel環境変数対応
// このファイルは Vercel のビルド時に環境変数を注入するためのスクリプトです

// Vercel環境変数をブラウザで利用可能にする
window.SUPABASE_CONFIG = {
    url: '__VITE_SUPABASE_URL__',
    anonKey: '__VITE_SUPABASE_ANON_KEY__'
};

// 開発環境用のフォールバック設定
if (window.SUPABASE_CONFIG.url === '__VITE_SUPABASE_URL__') {
    window.SUPABASE_CONFIG = {
        url: 'https://ocfljsoxxgmnzqlquchx.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmxqc294eGdtbnpxbHF1Y2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNTQ7ODYsImV4cCI6MjA3MjczMDc4Nn0.-7ehWfqboDccUKpk83Ys50l25sGsFXwG_12U0T33IJ0'
    };
}