// ===============================================
// 祝日自動生成ツール
// ===============================================
// 機能:
// - holiday_patternsテーブルから祝日パターンを取得
// - 指定年の祝日を自動計算・生成
// - 振替休日も自動判定

import { supabase } from '../../supabase-client.js';

export class HolidayGenerator {
    constructor() {
        this.patterns = [];
    }

    /**
     * 祝日パターンをロード
     */
    async loadPatterns() {
        const { data, error } = await supabase
            .from('holiday_patterns')
            .select('*')
            .eq('is_active', true)
            .order('month', { ascending: true });

        if (error) {
            console.error('Failed to load holiday patterns:', error);
            return false;
        }

        this.patterns = data || [];
        console.log(`Loaded ${this.patterns.length} holiday patterns`);
        return true;
    }

    /**
     * 指定年の祝日を自動生成
     * @param {number} year - 生成する年
     * @returns {Array} - 生成された祝日の配列
     */
    async generateHolidaysForYear(year) {
        if (!this.patterns.length) {
            await this.loadPatterns();
        }

        const holidays = [];

        for (const pattern of this.patterns) {
            let date;

            if (pattern.type === 'fixed') {
                // 固定日の祝日
                date = new Date(year, pattern.month - 1, pattern.day);
            } else if (pattern.type === 'happy_monday') {
                // ハッピーマンデー（第N月曜日）
                date = this.getNthWeekday(year, pattern.month, pattern.week_number, pattern.day_of_week);
            } else if (pattern.type === 'equinox') {
                // 春分/秋分の日
                date = this.calculateEquinox(year, pattern.month);
            } else {
                continue; // customタイプは手動登録のみ
            }

            holidays.push({
                year: year,
                date: this.formatDate(date),
                name: pattern.name,
                pattern_id: pattern.id,
                type: 'national',
                is_working_day: false,
                notes: this.generateNotes(pattern)
            });
        }

        // 振替休日を追加
        const substituteHolidays = this.generateSubstituteHolidays(holidays, year);
        holidays.push(...substituteHolidays);

        // 日付順にソート
        holidays.sort((a, b) => new Date(a.date) - new Date(b.date));

        return holidays;
    }

    /**
     * 指定年の祝日をデータベースに保存
     * @param {number} year - 保存する年
     * @param {boolean} overwrite - 既存データを上書きするか
     */
    async saveHolidaysForYear(year, overwrite = false) {
        try {
            // 祝日生成
            const holidays = await this.generateHolidaysForYear(year);

            if (overwrite) {
                // 既存の国民の祝日を削除
                const { error: deleteError } = await supabase
                    .from('holidays')
                    .delete()
                    .eq('year', year)
                    .eq('type', 'national');

                if (deleteError) {
                    console.error('Failed to delete existing holidays:', deleteError);
                    throw deleteError;
                }
            }

            // 新しい祝日を挿入
            const { data, error: insertError } = await supabase
                .from('holidays')
                .insert(holidays)
                .select();

            if (insertError) {
                console.error('Failed to insert holidays:', insertError);
                throw insertError;
            }

            console.log(`Successfully saved ${data.length} holidays for year ${year}`);
            return data;
        } catch (error) {
            console.error('Error saving holidays:', error);
            throw error;
        }
    }

    /**
     * 第N週のX曜日を計算
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     * @param {number} weekNumber - 第何週（1-5）
     * @param {number} dayOfWeek - 曜日（0=日, 1=月, ..., 6=土）
     */
    getNthWeekday(year, month, weekNumber, dayOfWeek) {
        // その月の1日を取得
        const firstDay = new Date(year, month - 1, 1);
        const firstDayOfWeek = firstDay.getDay();

        // 最初のX曜日までの日数を計算
        let offset = (dayOfWeek - firstDayOfWeek + 7) % 7;
        if (offset === 0 && firstDayOfWeek !== dayOfWeek) {
            offset = 7;
        }

        // 第N週のX曜日の日付を計算
        const day = 1 + offset + (weekNumber - 1) * 7;

        return new Date(year, month - 1, day);
    }

    /**
     * 春分/秋分の日を計算（簡易版）
     * @param {number} year - 年
     * @param {number} month - 月（3=春分, 9=秋分）
     */
    calculateEquinox(year, month) {
        // 春分/秋分の計算式（2000-2099年用の簡易式）
        // 出典: 国立天文台の計算式を簡略化

        if (month === 3) {
            // 春分の日
            const day = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
            return new Date(year, 2, day);
        } else if (month === 9) {
            // 秋分の日
            const day = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
            return new Date(year, 8, day);
        }

        return null;
    }

    /**
     * 振替休日を生成
     * @param {Array} holidays - 祝日リスト
     * @param {number} year - 年
     */
    generateSubstituteHolidays(holidays, year) {
        const substitutes = [];
        const holidayDates = new Set(holidays.map(h => h.date));

        for (const holiday of holidays) {
            const date = new Date(holiday.date);

            // 日曜日の祝日
            if (date.getDay() === 0) {
                // 翌日が祝日でない日まで進める
                let substituteDate = new Date(date);
                do {
                    substituteDate.setDate(substituteDate.getDate() + 1);
                } while (holidayDates.has(this.formatDate(substituteDate)));

                const substituteDateStr = this.formatDate(substituteDate);

                // まだ振替休日として追加していない場合のみ追加
                if (!substitutes.some(s => s.date === substituteDateStr)) {
                    substitutes.push({
                        year: year,
                        date: substituteDateStr,
                        name: '振替休日',
                        pattern_id: null,
                        type: 'national',
                        is_working_day: false,
                        notes: `${holiday.name}(${this.formatDateJP(date)})の振替`
                    });

                    // 振替休日も祝日リストに追加（連続チェック用）
                    holidayDates.add(substituteDateStr);
                }
            }
        }

        return substitutes;
    }

    /**
     * パターンに応じた備考を生成
     */
    generateNotes(pattern) {
        if (pattern.type === 'fixed') {
            return `${pattern.month}月${pattern.day}日`;
        } else if (pattern.type === 'happy_monday') {
            const weekNames = ['', '第1', '第2', '第3', '第4', '第5'];
            return `${pattern.month}月${weekNames[pattern.week_number]}月曜日`;
        } else if (pattern.type === 'equinox') {
            return '天文計算による';
        }
        return null;
    }

    /**
     * 日付をYYYY-MM-DD形式に変換
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 日付を日本語形式に変換（M/D）
     */
    formatDateJP(date) {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${month}/${day}`;
    }

    /**
     * 指定年の祝日が既に登録されているかチェック
     */
    async checkHolidaysExist(year) {
        const { data, error } = await supabase
            .from('holidays')
            .select('id')
            .eq('year', year)
            .eq('type', 'national')
            .limit(1);

        if (error) {
            console.error('Failed to check holidays:', error);
            return false;
        }

        return data && data.length > 0;
    }

    /**
     * 複数年分の祝日を一括生成
     * @param {number} startYear - 開始年
     * @param {number} endYear - 終了年
     */
    async generateHolidaysForYears(startYear, endYear) {
        const results = [];

        for (let year = startYear; year <= endYear; year++) {
            const exists = await this.checkHolidaysExist(year);

            if (exists) {
                console.log(`${year}年の祝日は既に登録済みです`);
                results.push({ year, status: 'exists', count: 0 });
            } else {
                try {
                    const data = await this.saveHolidaysForYear(year, false);
                    results.push({ year, status: 'success', count: data.length });
                    console.log(`${year}年の祝日を${data.length}件登録しました`);
                } catch (error) {
                    results.push({ year, status: 'error', error });
                    console.error(`${year}年の祝日登録に失敗しました:`, error);
                }
            }
        }

        return results;
    }
}
