-- ===============================================
-- 2024-2025年の祝日実績データ投入
-- ===============================================
-- 実行方法: Supabase Dashboard > SQL Editor で実行
-- 注意: これは初期データ。2026年以降はJavaScriptで自動生成

-- 既存の国民の祝日データを削除（再実行可能にするため）
DELETE FROM holidays WHERE type = 'national' AND year IN (2024, 2025);

-- ===============================================
-- 2024年の祝日
-- ===============================================
INSERT INTO holidays (year, date, name, pattern_id, type, notes) VALUES
-- 固定日の祝日
(2024, '2024-01-01', '元日', (SELECT id FROM holiday_patterns WHERE name = '元日'), 'national', NULL),
(2024, '2024-02-11', '建国記念の日', (SELECT id FROM holiday_patterns WHERE name = '建国記念の日'), 'national', NULL),
(2024, '2024-02-23', '天皇誕生日', (SELECT id FROM holiday_patterns WHERE name = '天皇誕生日'), 'national', NULL),
(2024, '2024-04-29', '昭和の日', (SELECT id FROM holiday_patterns WHERE name = '昭和の日'), 'national', NULL),
(2024, '2024-05-03', '憲法記念日', (SELECT id FROM holiday_patterns WHERE name = '憲法記念日'), 'national', NULL),
(2024, '2024-05-04', 'みどりの日', (SELECT id FROM holiday_patterns WHERE name = 'みどりの日'), 'national', NULL),
(2024, '2024-05-05', 'こどもの日', (SELECT id FROM holiday_patterns WHERE name = 'こどもの日'), 'national', NULL),
(2024, '2024-08-11', '山の日', (SELECT id FROM holiday_patterns WHERE name = '山の日'), 'national', NULL),
(2024, '2024-11-03', '文化の日', (SELECT id FROM holiday_patterns WHERE name = '文化の日'), 'national', NULL),
(2024, '2024-11-23', '勤労感謝の日', (SELECT id FROM holiday_patterns WHERE name = '勤労感謝の日'), 'national', NULL),

-- ハッピーマンデーの祝日
(2024, '2024-01-08', '成人の日', (SELECT id FROM holiday_patterns WHERE name = '成人の日'), 'national', '1月第2月曜日'),
(2024, '2024-07-15', '海の日', (SELECT id FROM holiday_patterns WHERE name = '海の日'), 'national', '7月第3月曜日'),
(2024, '2024-09-16', '敬老の日', (SELECT id FROM holiday_patterns WHERE name = '敬老の日'), 'national', '9月第3月曜日'),
(2024, '2024-10-14', 'スポーツの日', (SELECT id FROM holiday_patterns WHERE name = 'スポーツの日'), 'national', '10月第2月曜日'),

-- 天文計算の祝日
(2024, '2024-03-20', '春分の日', (SELECT id FROM holiday_patterns WHERE name = '春分の日'), 'national', '2024年春分日'),
(2024, '2024-09-22', '秋分の日', (SELECT id FROM holiday_patterns WHERE name = '秋分の日'), 'national', '2024年秋分日'),

-- 振替休日
(2024, '2024-02-12', '振替休日', NULL, 'national', '2/11(日)の振替'),
(2024, '2024-05-06', '振替休日', NULL, 'national', '5/5(日)の振替'),
(2024, '2024-08-12', '振替休日', NULL, 'national', '8/11(日)の振替'),
(2024, '2024-09-23', '振替休日', NULL, 'national', '9/22(日)の振替'),
(2024, '2024-11-04', '振替休日', NULL, 'national', '11/3(日)の振替');

-- ===============================================
-- 2025年の祝日
-- ===============================================
INSERT INTO holidays (year, date, name, pattern_id, type, notes) VALUES
-- 固定日の祝日
(2025, '2025-01-01', '元日', (SELECT id FROM holiday_patterns WHERE name = '元日'), 'national', NULL),
(2025, '2025-02-11', '建国記念の日', (SELECT id FROM holiday_patterns WHERE name = '建国記念の日'), 'national', NULL),
(2025, '2025-02-23', '天皇誕生日', (SELECT id FROM holiday_patterns WHERE name = '天皇誕生日'), 'national', NULL),
(2025, '2025-04-29', '昭和の日', (SELECT id FROM holiday_patterns WHERE name = '昭和の日'), 'national', NULL),
(2025, '2025-05-03', '憲法記念日', (SELECT id FROM holiday_patterns WHERE name = '憲法記念日'), 'national', NULL),
(2025, '2025-05-04', 'みどりの日', (SELECT id FROM holiday_patterns WHERE name = 'みどりの日'), 'national', NULL),
(2025, '2025-05-05', 'こどもの日', (SELECT id FROM holiday_patterns WHERE name = 'こどもの日'), 'national', NULL),
(2025, '2025-08-11', '山の日', (SELECT id FROM holiday_patterns WHERE name = '山の日'), 'national', NULL),
(2025, '2025-11-03', '文化の日', (SELECT id FROM holiday_patterns WHERE name = '文化の日'), 'national', NULL),
(2025, '2025-11-23', '勤労感謝の日', (SELECT id FROM holiday_patterns WHERE name = '勤労感謝の日'), 'national', NULL),

-- ハッピーマンデーの祝日
(2025, '2025-01-13', '成人の日', (SELECT id FROM holiday_patterns WHERE name = '成人の日'), 'national', '1月第2月曜日'),
(2025, '2025-07-21', '海の日', (SELECT id FROM holiday_patterns WHERE name = '海の日'), 'national', '7月第3月曜日'),
(2025, '2025-09-15', '敬老の日', (SELECT id FROM holiday_patterns WHERE name = '敬老の日'), 'national', '9月第3月曜日'),
(2025, '2025-10-13', 'スポーツの日', (SELECT id FROM holiday_patterns WHERE name = 'スポーツの日'), 'national', '10月第2月曜日'),

-- 天文計算の祝日
(2025, '2025-03-20', '春分の日', (SELECT id FROM holiday_patterns WHERE name = '春分の日'), 'national', '2025年春分日'),
(2025, '2025-09-23', '秋分の日', (SELECT id FROM holiday_patterns WHERE name = '秋分の日'), 'national', '2025年秋分日'),

-- 振替休日
(2025, '2025-02-24', '振替休日', NULL, 'national', '2/23(日)の振替'),
(2025, '2025-05-06', '振替休日', NULL, 'national', '5/5(月)は祝日のため振替なし、実際は5/6'),
(2025, '2025-11-24', '振替休日', NULL, 'national', '11/23(日)の振替');

-- ===============================================
-- 確認用クエリ
-- ===============================================
-- 年別祝日数
SELECT
  year as 年,
  COUNT(*) as 祝日数
FROM holidays
WHERE type = 'national'
GROUP BY year
ORDER BY year;

-- 2024年の祝日一覧
SELECT
  TO_CHAR(date, 'YYYY-MM-DD (Dy)') as 日付,
  name as 祝日名,
  notes as 備考
FROM holidays
WHERE year = 2024 AND type = 'national'
ORDER BY date;

-- 2025年の祝日一覧
SELECT
  TO_CHAR(date, 'YYYY-MM-DD (Dy)') as 日付,
  name as 祝日名,
  notes as 備考
FROM holidays
WHERE year = 2025 AND type = 'national'
ORDER BY date;
