-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job for daily backup at 0:00 JST (15:00 UTC)
-- This will run every day at 15:00 UTC (0:00 JST next day)
SELECT cron.schedule(
  'daily-backup-job',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ocfljsoxxgmnzqlquchx.supabase.co/functions/v1/daily-backup',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmxqc294eGdtbnpxbHF1Y2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNTQ3ODYsImV4cCI6MjA3MjczMDc4Nn0.-7ehWfqboDccUKpk83Ys50l25sGsFXwG_12U0T33IJ0", "Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- View existing cron jobs (for debugging)
-- SELECT * FROM cron.job;

-- To remove the job (uncomment if needed):
-- SELECT cron.unschedule('daily-backup-job');

-- Add backup history table for tracking
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

-- Add RLS policy for backup_history
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read backup history
CREATE POLICY "Allow read access to backup_history" ON backup_history
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to insert/update backup history
CREATE POLICY "Allow service role to manage backup_history" ON backup_history
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_backup_history_date ON backup_history(backup_date DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);

-- Insert comment about the setup
INSERT INTO backup_history (backup_type, status, file_name, total_records, error_message) 
VALUES ('setup', 'completed', 'daily-backup-cron-setup', 0, 'Daily backup cron job configured successfully');