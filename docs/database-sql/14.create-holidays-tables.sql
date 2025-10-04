-- ===============================================
-- 休日管理システム - テーブル作成（改訂版）
-- ===============================================
-- 実行方法: Supabase Dashboard > SQL Editor で実行
--
-- 設計方針:
-- 1. holiday_patterns: 祝日パターンマスタ（固定日、ハッピーマンデーなど）
-- 2. holidays: 年度別祝日実績（自動生成 + 手動調整可能）
-- 3. staff_vacations: 個人休暇（スタッフごとの休暇管理）

-- 1. 祝日パターンマスタテーブル
CREATE TABLE IF NOT EXISTS holiday_patterns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,  -- 祝日名（例: '元日', '成人の日'）
  type TEXT NOT NULL CHECK (type IN ('fixed', 'happy_monday', 'equinox', 'custom')),
  -- fixed: 固定日（1/1, 2/11など）
  -- happy_monday: ハッピーマンデー制度（第2月曜など）
  -- equinox: 春分/秋分（天文計算が必要）
  -- custom: カスタム祝日

  month INTEGER CHECK (month >= 1 AND month <= 12),  -- 月（1-12）
  day INTEGER CHECK (day >= 1 AND day <= 31),  -- 日（fixed typeの場合）
  week_number INTEGER CHECK (week_number >= 1 AND week_number <= 5),  -- 第何週（happy_mondayの場合）
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 曜日（0=日, 1=月, ..., 6=土）

  is_active BOOLEAN DEFAULT TRUE,  -- この祝日を使用するか
  notes TEXT,  -- 備考
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 年度別祝日実績テーブル（自動生成 + 手動調整可能）
CREATE TABLE IF NOT EXISTS holidays (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,  -- 年度
  date DATE NOT NULL UNIQUE,  -- 休日の日付
  name TEXT NOT NULL,  -- 休日名
  pattern_id BIGINT REFERENCES holiday_patterns(id) ON DELETE SET NULL,  -- どのパターンから生成されたか
  is_working_day BOOLEAN DEFAULT FALSE,  -- この日は出勤日として扱うか（祝日出勤の場合true）
  type TEXT NOT NULL CHECK (type IN ('national', 'company', 'custom')),
  -- national: 国民の祝日
  -- company: 会社全体の休日（夏季休業など）
  -- custom: カスタム休日
  notes TEXT,  -- 備考
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 個人休暇テーブル
CREATE TABLE IF NOT EXISTS staff_vacations (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT REFERENCES staffs(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  vacation_type TEXT DEFAULT 'personal' CHECK (vacation_type IN ('personal', 'sick', 'paid')),
  -- personal: 私用、sick: 病欠、paid: 有給休暇
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 開始日 <= 終了日のチェック
  CHECK (start_date <= end_date)
);

-- ===============================================
-- インデックス作成
-- ===============================================
CREATE INDEX IF NOT EXISTS idx_holiday_patterns_type ON holiday_patterns(type);
CREATE INDEX IF NOT EXISTS idx_holiday_patterns_active ON holiday_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(year);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_type ON holidays(type);
CREATE INDEX IF NOT EXISTS idx_holidays_pattern ON holidays(pattern_id);
CREATE INDEX IF NOT EXISTS idx_staff_vacations_staff ON staff_vacations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_vacations_dates ON staff_vacations(start_date, end_date);

-- ===============================================
-- RLS (Row Level Security) 設定
-- ===============================================
ALTER TABLE holiday_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_vacations ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー作成（認証済みユーザーのみアクセス可能）
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON holiday_patterns;
CREATE POLICY "Enable all operations for authenticated users" ON holiday_patterns
    FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON holidays;
CREATE POLICY "Enable all operations for authenticated users" ON holidays
    FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON staff_vacations;
CREATE POLICY "Enable all operations for authenticated users" ON staff_vacations
    FOR ALL USING (auth.uid() IS NOT NULL);

-- ===============================================
-- updated_at の自動更新用トリガー
-- ===============================================
CREATE TRIGGER update_holiday_patterns_updated_at BEFORE UPDATE ON holiday_patterns
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON holidays
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_staff_vacations_updated_at BEFORE UPDATE ON staff_vacations
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===============================================
-- 確認用クエリ
-- ===============================================
-- テーブル作成確認
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('holiday_patterns', 'holidays', 'staff_vacations');
