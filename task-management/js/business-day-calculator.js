// ===============================================
// 営業日計算ツール
// ===============================================
// 機能:
// - 土日・祝日・会社休日・個人休暇を考慮した営業日計算
// - タスクの作業期間計算（営業日ベース）
// - タスク割り込み時の後続タスク自動調整

import { supabase } from '../../supabase-client.js';

export class BusinessDayCalculator {
    constructor() {
        this.nationalHolidays = new Set();  // 国民の祝日
        this.companyHolidays = new Set();   // 会社全体の休日
        this.customHolidays = new Set();    // カスタム休日
        this.staffVacations = new Map();    // staff_id => Set<date>
        this.isLoaded = false;              // データロード完了フラグ
    }

    /**
     * 全休日データをSupabaseから取得
     */
    async loadHolidays() {
        try {
            // 既存データをクリア
            this.nationalHolidays.clear();
            this.companyHolidays.clear();
            this.customHolidays.clear();

            const { data: holidays, error } = await supabase
                .from('holidays')
                .select('date, type, is_working_day');

            if (error) {
                console.error('Failed to load holidays:', error);
                return;
            }

            // 型別に休日を分類（is_working_day=trueは除外）
            holidays?.forEach(h => {
                // 祝日出勤の場合はスキップ
                if (h.is_working_day) return;

                const dateStr = h.date;
                if (h.type === 'national') {
                    this.nationalHolidays.add(dateStr);
                } else if (h.type === 'company') {
                    this.companyHolidays.add(dateStr);
                } else if (h.type === 'custom') {
                    this.customHolidays.add(dateStr);
                }
            });

            this.isLoaded = true;
            console.log(`✅ 休日データ読み込み完了: ${holidays?.length || 0}件 (祝日:${this.nationalHolidays.size}, 会社:${this.companyHolidays.size}, カスタム:${this.customHolidays.size})`);
        } catch (error) {
            console.error('Error loading holidays:', error);
        }
    }

    /**
     * 特定スタッフの休暇を取得
     * @param {number} staffId - スタッフID
     */
    async loadStaffVacations(staffId) {
        try {
            const { data: vacations, error } = await supabase
                .from('staff_vacations')
                .select('start_date, end_date')
                .eq('staff_id', staffId);

            if (error) {
                console.error('Failed to load staff vacations:', error);
                return;
            }

            // 休暇期間内の全日付をSetに追加
            const vacationDates = new Set();
            vacations?.forEach(v => {
                let current = new Date(v.start_date);
                const end = new Date(v.end_date);

                while (current <= end) {
                    vacationDates.add(this.formatDate(current));
                    current.setDate(current.getDate() + 1);
                }
            });

            this.staffVacations.set(staffId, vacationDates);
            console.log(`Loaded ${vacationDates.size} vacation days for staff ${staffId}`);
        } catch (error) {
            console.error('Error loading staff vacations:', error);
        }
    }

    /**
     * 営業日判定（全体の休日のみチェック）
     * @param {Date} date - 判定する日付
     * @returns {boolean} - 営業日ならtrue
     */
    isBusinessDay(date) {
        const dateStr = this.formatDate(date);
        const dayOfWeek = date.getDay();

        // 土曜日(6)、日曜日(0)
        if (dayOfWeek === 0 || dayOfWeek === 6) return false;

        // 祝日
        if (this.nationalHolidays.has(dateStr)) return false;

        // 会社休日
        if (this.companyHolidays.has(dateStr)) return false;

        // カスタム休日
        if (this.customHolidays.has(dateStr)) return false;

        return true;
    }

    /**
     * 個人休暇も含めた稼働日判定
     * @param {Date} date - 判定する日付
     * @param {number} staffId - スタッフID
     * @returns {boolean} - 稼働日ならtrue
     */
    isWorkingDay(date, staffId) {
        // まず営業日かチェック
        if (!this.isBusinessDay(date)) return false;

        // 個人休暇チェック
        const dateStr = this.formatDate(date);
        const vacations = this.staffVacations.get(staffId);
        if (vacations?.has(dateStr)) return false;

        return true;
    }

    /**
     * 休日タイプを取得（表示用）
     * @param {Date} date - 判定する日付
     * @param {number} staffId - スタッフID（省略可）
     * @returns {string|null} - 休日タイプ or null
     */
    getHolidayType(date, staffId = null) {
        const dateStr = this.formatDate(date);
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 0) return 'sunday';
        if (dayOfWeek === 6) return 'saturday';
        if (this.nationalHolidays.has(dateStr)) return 'national';
        if (this.companyHolidays.has(dateStr)) return 'company';
        if (this.customHolidays.has(dateStr)) return 'custom';

        // 個人休暇チェック
        if (staffId !== null) {
            const vacations = this.staffVacations.get(staffId);
            if (vacations?.has(dateStr)) return 'vacation';
        }

        return null;
    }

    /**
     * 営業日ベースで作業期間を計算（土日祝除外）
     * @param {Date|string} startDate - 開始日
     * @param {number} estimatedHours - 想定時間（時間単位）
     * @returns {Object} - { startDate, endDate, businessDays, totalDays }
     */
    calculateWorkPeriod(startDate, estimatedHours) {
        const daysNeeded = Math.ceil(estimatedHours / 8);
        const dates = [];
        let current = new Date(startDate);
        let count = 0;

        // 開始日が営業日でない場合、次の営業日まで進める
        while (!this.isBusinessDay(current)) {
            current.setDate(current.getDate() + 1);
        }

        // 必要日数分の営業日を収集
        while (count < daysNeeded) {
            if (this.isBusinessDay(current)) {
                dates.push(new Date(current));
                count++;
            }
            current.setDate(current.getDate() + 1);
        }

        return {
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            businessDays: dates,
            totalDays: daysNeeded
        };
    }

    /**
     * タスク割り込み時の後続タスク自動調整
     * @param {Object} insertedTask - 挿入するタスク
     * @param {Date|string} newStartDate - 新しい開始日
     * @param {Array} allTasks - 全タスクリスト
     * @returns {Array} - 更新が必要なタスクの配列 [{ id, work_date }]
     */
    async adjustFollowingTasks(insertedTask, newStartDate, allTasks) {
        // 挿入タスクの期間を計算
        const period = this.calculateWorkPeriod(
            newStartDate,
            insertedTask.estimated_time_hours
        );

        // 影響を受けるタスク（挿入日以降の随時でないタスク）
        const affectedTasks = allTasks
            .filter(t =>
                t.work_date >= this.formatDate(newStartDate) &&
                t.id !== insertedTask.id &&
                !t.is_anytime
            )
            .sort((a, b) => new Date(a.work_date) - new Date(b.work_date));

        // 次の利用可能日（挿入タスクの終了日の翌日）
        let nextAvailableDate = new Date(period.endDate);
        nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);

        const updates = [];

        for (const task of affectedTasks) {
            // 次の営業日まで進める
            while (!this.isBusinessDay(nextAvailableDate)) {
                nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
            }

            updates.push({
                id: task.id,
                work_date: this.formatDate(nextAvailableDate)
            });

            // このタスクの期間を計算し、次のタスクの開始日を設定
            const taskPeriod = this.calculateWorkPeriod(
                nextAvailableDate,
                task.estimated_time_hours
            );

            nextAvailableDate = new Date(taskPeriod.endDate);
            nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
        }

        return updates;
    }

    /**
     * 2つの日付間の営業日数を計算
     * @param {Date|string} startDate - 開始日
     * @param {Date|string} endDate - 終了日
     * @returns {number} - 営業日数
     */
    countBusinessDays(startDate, endDate) {
        let current = new Date(startDate);
        const end = new Date(endDate);
        let count = 0;

        while (current <= end) {
            if (this.isBusinessDay(current)) {
                count++;
            }
            current.setDate(current.getDate() + 1);
        }

        return count;
    }

    /**
     * 日付をYYYY-MM-DD形式の文字列に変換
     * @param {Date} date - 日付オブジェクト
     * @returns {string} - YYYY-MM-DD形式の文字列
     */
    formatDate(date) {
        if (typeof date === 'string') {
            return date.split('T')[0]; // ISOString形式の場合
        }
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 休日データを再読み込み
     */
    async reload() {
        this.nationalHolidays.clear();
        this.companyHolidays.clear();
        this.customHolidays.clear();
        this.staffVacations.clear();
        this.isLoaded = false;
        await this.loadHolidays();
    }
}
