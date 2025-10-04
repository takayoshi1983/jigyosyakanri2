-- ===============================================
-- 祝日パターンマスタデータ投入
-- ===============================================
-- 実行方法: Supabase Dashboard > SQL Editor で実行
-- 注意: このデータは初回のみ投入。以降はUI上で管理可能

-- 既存データクリア（再実行可能にするため）
DELETE FROM holiday_patterns;

-- 日本の祝日パターンを登録
-- ===============================================

-- 固定日の祝日
INSERT INTO holiday_patterns (name, type, month, day, is_active, notes) VALUES
('元日', 'fixed', 1, 1, true, '年のはじめを祝う'),
('建国記念の日', 'fixed', 2, 11, true, '建国をしのび、国を愛する心を養う'),
('天皇誕生日', 'fixed', 2, 23, true, '天皇の誕生日を祝う'),
('昭和の日', 'fixed', 4, 29, true, '激動の日々を経て、復興を遂げた昭和の時代を顧み、国の将来に思いをいたす'),
('憲法記念日', 'fixed', 5, 3, true, '日本国憲法の施行を記念し、国の成長を期する'),
('みどりの日', 'fixed', 5, 4, true, '自然に親しむとともにその恩恵に感謝し、豊かな心をはぐくむ'),
('こどもの日', 'fixed', 5, 5, true, 'こどもの人格を重んじ、こどもの幸福をはかるとともに、母に感謝する'),
('山の日', 'fixed', 8, 11, true, '山に親しむ機会を得て、山の恩恵に感謝する'),
('文化の日', 'fixed', 11, 3, true, '自由と平和を愛し、文化をすすめる'),
('勤労感謝の日', 'fixed', 11, 23, true, '勤労をたつとび、生産を祝い、国民たがいに感謝しあう');

-- ハッピーマンデー制度の祝日（第N月曜日）
INSERT INTO holiday_patterns (name, type, month, week_number, day_of_week, is_active, notes) VALUES
('成人の日', 'happy_monday', 1, 2, 1, true, 'おとなになったことを自覚し、みずから生き抜こうとする青年を祝いはげます（1月第2月曜日）'),
('海の日', 'happy_monday', 7, 3, 1, true, '海の恩恵に感謝するとともに、海洋国日本の繁栄を願う（7月第3月曜日）'),
('敬老の日', 'happy_monday', 9, 3, 1, true, '多年にわたり社会につくしてきた老人を敬愛し、長寿を祝う（9月第3月曜日）'),
('スポーツの日', 'happy_monday', 10, 2, 1, true, 'スポーツを楽しみ、他者を尊重する精神を培うとともに、健康で活力ある社会の実現を願う（10月第2月曜日）');

-- 天文計算が必要な祝日（春分・秋分）
-- 注意: これらは毎年日付が変わるため、自動計算が必要
INSERT INTO holiday_patterns (name, type, month, is_active, notes) VALUES
('春分の日', 'equinox', 3, true, '自然をたたえ、生物をいつくしむ（春分日：毎年3/20または3/21）'),
('秋分の日', 'equinox', 9, true, '祖先をうやまい、なくなった人々をしのぶ（秋分日：毎年9/22または9/23）');

-- ===============================================
-- 確認用クエリ
-- ===============================================
SELECT
  id,
  name,
  type,
  CASE
    WHEN type = 'fixed' THEN CONCAT(month, '月', day, '日')
    WHEN type = 'happy_monday' THEN CONCAT(month, '月第', week_number, '月曜日')
    WHEN type = 'equinox' THEN CONCAT(month, '月（天文計算）')
    ELSE 'カスタム'
  END as 日付,
  is_active as 有効
FROM holiday_patterns
ORDER BY month, day, week_number;

-- 登録件数確認
SELECT
  type as パターン種別,
  COUNT(*) as 件数
FROM holiday_patterns
GROUP BY type
ORDER BY type;
