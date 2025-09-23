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
        url: 'https://jhjexgkzzbzxhhlezaoa.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoamV4Z2t6emJ6eGhobGV6YW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDUyMzAsImV4cCI6MjA3MjIyMTIzMH0.So1WcCBUEV-mMQu6_k-xRdNn3XDLwGxcCzDT3L402EQ'
    };
}
