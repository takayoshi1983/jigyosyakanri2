const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jhjexgkzzbzxhhlezaoa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoanpleGdrenpienhobGV6YW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU1NDAzNjksImV4cCI6MjA1MTExNjM2OX0.KF4ydNm7LCglPbXhLM5LNc9c9k9FQ0SqKXY-fETH_BY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  // 既存のステータス値を確認
  const { data, error } = await supabase
    .from('tasks')
    .select('status')
    .limit(1000);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const statuses = [...new Set(data.map(t => t.status))];
  console.log('既存のステータス値:', statuses);
}

checkStatus();
