// Vercel用ビルドスクリプト - 環境変数を config.js に注入
const fs = require('fs');
const path = require('path');

// 環境変数を取得
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jhjexgkzzbzxhhlezaoa.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoamV4Z2t6emJ6eGhobGV6YW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDUyMzAsImV4cCI6MjA3MjIyMTIzMH0.So1WcCBUEV-mMQu6_k-xRdNn3XDLwGxcCzDT3L402EQ';

// config.js のテンプレート
const configContent = `// 環境設定ファイル - Vercel環境変数対応（ビルド時生成）
// このファイルは Vercel のビルド時に環境変数を注入するためのスクリプトです

// Vercel環境変数をブラウザで利用可能にする
window.SUPABASE_CONFIG = {
    url: '${supabaseUrl}',
    anonKey: '${supabaseAnonKey}'
};

console.log('Supabase config loaded:', { url: window.SUPABASE_CONFIG.url });
`;

// config.js を書き込み
fs.writeFileSync('config.js', configContent);
console.log('✅ config.js generated successfully');
console.log('Supabase URL:', supabaseUrl);
console.log('Anon Key (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...');