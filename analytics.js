// 分析機能メインスクリプト
import { SupabaseAPI, supabase } from './supabase-client.js';
import { normalizeText, toastThrottler } from './utils.js';
import './toast.js'; // showToastはwindow.showToastとしてグローバルに利用可能

// === カスタムツールチップ関数（グローバルスコープ - 最優先読み込み） ===
window.showCustomTooltip = function(element, text) {
    // 既存のツールチップを削除
    window.hideCustomTooltip(element);

    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip show';
    tooltip.textContent = text;

    // 親要素に追加
    element.parentElement.appendChild(tooltip);

    // アニメーション用の遅延
    setTimeout(() => {
        tooltip.classList.add('show');
    }, 10);
};

window.hideCustomTooltip = function(element) {
    const tooltip = element.parentElement.querySelector('.custom-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
};

class AnalyticsPage {
    constructor() {
        this.clients = [];
        this.staffs = [];
        this.monthlyTasks = [];
        this.currentFilters = {
            startPeriod: '',
            endPeriod: '',
            staffId: '',
            fiscalMonth: '',
            businessName: ''
        };
        this.lastAnalysisData = null; // 最後の分析結果を保持
        this.currentSort = null; // 現在のソート列
        this.sortDirection = 'asc'; // ソート方向
        this.refreshTimeout = null; // 透明リフレッシュ用タイマー

        // 🚀 パフォーマンス最適化: インデックス構造
        this.tasksByClient = new Map(); // client_id -> tasks[]
        this.staffsMap = new Map(); // staff_id -> staff object
        this.clientsMap = new Map(); // client_id -> client object

        // 🚀 パフォーマンス最適化: キャッシュ構造
        this.taskStatsCache = new Map(); // task object -> { total, completed, tasksList }
        this.clientStatsCache = new Map(); // client_id -> { totalTasks, completedTasks }
    }


    async initialize() {
        
        try {
            // 認証状態確認
            const user = await SupabaseAPI.getCurrentUser();
            if (!user) {
                showToast('認証が必要です', 'error');
                window.location.href = 'index.html';
                return;
            }

            // ページ可視性変更の監視を設定（他ページからの戻り検出）
            this.setupPageVisibilityListener();

            // 基本データ読み込み
            await this.loadInitialData();

            // 設定読み込み（関与終了顧問先の表示制御）
            this.loadDisplaySettings();

            // UI初期化
            this.setupEventListeners();
            this.populateFilters();

            // リフレッシュパラメータチェック（削除後のデータ更新用）
            const refreshRequested = this.checkRefreshParameter();

            // URLパラメータから担当者を自動選択（復元前に処理）
            const hasUrlParameters = this.handleUrlParameters();

            // 選択された担当者でフィルターをデフォルト設定
            const selectedStaffId = SupabaseAPI.getSelectedStaffId();
            let staffFilterApplied = false;

            // staff_id が 1（管理者）の場合はフィルター無し、それ以外はフィルター適用
            if (selectedStaffId && selectedStaffId !== '1') {
                const staffSelect = document.getElementById('staff-filter');
                if (staffSelect) {
                    staffSelect.value = selectedStaffId;
                    this.currentFilters.staffId = selectedStaffId;
                    staffFilterApplied = true;
                }
            } else if (selectedStaffId === '1') {
                // 管理者の場合はフィルター無しで全体表示
                console.log('管理者（staff_id: 1）でログイン - 全体表示');
                staffFilterApplied = true; // 分析を実行するためフラグON
            }

            // URLパラメータ、リフレッシュ要求、または担当者フィルター適用時は新規分析
            if (hasUrlParameters || refreshRequested || staffFilterApplied) {
                if (refreshRequested) {
                    // 強制データ更新後に分析実行
                    setTimeout(async () => {
                        await this.forceDataRefresh();
                        await this.performAnalysis();
                        showToast('最新データで更新しました', 'success');
                    }, 500);
                } else {
                    // 担当者フィルター適用時は即座に分析実行
                    setTimeout(async () => {
                        await this.performAnalysis();
                    }, 500);
                }
            } else {
                // URLパラメータがなく、担当者フィルターもない場合のみ保存された分析結果を復元
                const hasRestoredData = this.restoreAnalysisFromLocalStorage();
                if (!hasRestoredData) {
                    // 初期データで自動集計を実行
                    setTimeout(async () => {
                        await this.performAnalysis();
                    }, 500); // UI初期化完了後に実行
                }
            }
            
            showToast('分析機能を読み込みました', 'success');

            // マイタスク状況カードを表示・更新
            await this.updateMyTaskStatus();

            // 詳細画面から戻ってきた場合の透明リフレッシュ
            const fromDetails = document.referrer && document.referrer.includes('details.html');
            const sessionFlag = sessionStorage.getItem('returnFromDetails');

            if (fromDetails || sessionFlag) {

                // セッション フラグをクリア
                sessionStorage.removeItem('returnFromDetails');

                // 少し遅延させてからリフレッシュ（DOM安定のため）
                setTimeout(() => {
                    if (this.lastAnalysisData) {
                        this.scheduleTransparentRefresh();
                    }
                }, 1000);
            }

        } catch (error) {
            console.error('Analytics initialization failed:', error);
            showToast('分析機能の初期化に失敗しました', 'error');
        }
    }

    async loadInitialData() {

        // 並列でデータを取得
        const [clientsResult, staffsResult, tasksResult] = await Promise.all([
            SupabaseAPI.getClients(),
            SupabaseAPI.getStaffs(),
            SupabaseAPI.getMonthlyTasks()
        ]);

        this.clients = clientsResult || [];
        this.staffs = staffsResult || [];
        this.monthlyTasks = tasksResult || [];

        // 🚀 パフォーマンス最適化: インデックスを構築
        this.buildIndexes();

    }

    // 🚀 パフォーマンス最適化: 高速検索用インデックスを構築
    buildIndexes() {
        console.time('⚡ Index building');

        // clientsMap構築
        this.clientsMap.clear();
        this.clients.forEach(client => {
            this.clientsMap.set(client.id, client);
        });

        // staffsMap構築
        this.staffsMap.clear();
        this.staffs.forEach(staff => {
            this.staffsMap.set(staff.id, staff);
        });

        // tasksByClient構築（client_idごとにタスクをグループ化）
        this.tasksByClient.clear();
        this.monthlyTasks.forEach(task => {
            if (!this.tasksByClient.has(task.client_id)) {
                this.tasksByClient.set(task.client_id, []);
            }
            this.tasksByClient.get(task.client_id).push(task);
        });

        console.timeEnd('⚡ Index building');
        console.log(`📊 Indexed: ${this.clientsMap.size} clients, ${this.staffsMap.size} staffs, ${this.tasksByClient.size} client-task groups`);
    }

    // 🚀 パフォーマンス最適化: 高速検索メソッド
    getClientById(clientId) {
        return this.clientsMap.get(clientId);
    }

    getStaffById(staffId) {
        return this.staffsMap.get(staffId);
    }

    getTasksByClientId(clientId) {
        return this.tasksByClient.get(clientId) || [];
    }

    // 🚀 パフォーマンス最適化: タスク統計を計算（キャッシュ付き）
    getTaskStats(monthlyTask) {
        // キャッシュチェック
        if (this.taskStatsCache.has(monthlyTask)) {
            return this.taskStatsCache.get(monthlyTask);
        }

        let totalTasks = 0;
        let completedTasks = 0;
        let tasksList = [];

        if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
            tasksList = Object.values(monthlyTask.tasks);
            totalTasks = tasksList.length;
            completedTasks = tasksList.filter(task => task === true || task === '完了').length;
        }

        const stats = { totalTasks, completedTasks, tasksList };

        // キャッシュに保存
        this.taskStatsCache.set(monthlyTask, stats);

        return stats;
    }

    // 🚀 パフォーマンス最適化: クライアント別タスク集計（キャッシュ付き）
    getClientTaskStats(clientId, tasks) {
        const cacheKey = `${clientId}_${this.currentFilters.startPeriod}_${this.currentFilters.endPeriod}`;

        // キャッシュチェック
        if (this.clientStatsCache.has(cacheKey)) {
            return this.clientStatsCache.get(cacheKey);
        }

        const clientTasks = tasks.filter(t => t.client_id === clientId);
        let totalTasks = 0;
        let completedTasks = 0;

        clientTasks.forEach(monthlyTask => {
            const stats = this.getTaskStats(monthlyTask);
            totalTasks += stats.totalTasks;
            completedTasks += stats.completedTasks;
        });

        const result = { totalTasks, completedTasks };

        // キャッシュに保存
        this.clientStatsCache.set(cacheKey, result);

        return result;
    }

    // 🚀 パフォーマンス最適化: キャッシュをクリア（フィルター変更時に呼び出す）
    clearStatsCache() {
        this.taskStatsCache.clear();
        this.clientStatsCache.clear();
    }

    loadDisplaySettings() {
        // ローカルストレージからpersonalSettingsを取得
        const personalSettings = this.loadPersonalSettings();

        // body要素にクラスを適用して表示制御
        if (personalSettings.hideInactiveClients) {
            document.body.classList.add('hide-inactive-clients');
        } else {
            document.body.classList.remove('hide-inactive-clients');
        }

        // インスタンス変数として保存
        this.hideInactiveClients = personalSettings.hideInactiveClients || false;
    }

    loadPersonalSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('personalSettings') || '{}');
        // デフォルト値
        const defaults = {
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            hideInactiveClients: false,
            enableConfettiEffect: false
        };

        const mergedSettings = { ...defaults, ...savedSettings };
        return mergedSettings;
    }

    checkRefreshParameter() {
        const urlParams = new URLSearchParams(window.location.search);
        const refresh = urlParams.get('refresh');

        if (refresh === 'true') {
            // URLパラメータをクリア（ブラウザ履歴に残さないように）
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
            return true;
        }
        return false;
    }

    async forceDataRefresh() {
        // 強制的にデータを再読み込み
        await this.loadInitialData();
    }

    populateFilters() {
        // 期間選択のオプション生成（過去2年分）
        this.populatePeriodOptions();
        
        // 担当者選択のオプション生成
        this.populateStaffOptions();
        
        // デフォルト値設定
        this.setDefaultPeriod();
    }

    populatePeriodOptions() {
        const startSelect = document.getElementById('start-period');
        const endSelect = document.getElementById('end-period');
        
        // 現在の年月から過去2年分のオプションを生成
        const currentDate = new Date();
        const options = [];
        
        for (let i = 24; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const value = `${year}-${month.toString().padStart(2, '0')}`;
            const text = `${year}年${month}月`;
            options.push({ value, text });
        }
        
        // オプション追加
        options.forEach(option => {
            const startOption = new Option(option.text, option.value);
            const endOption = new Option(option.text, option.value);
            startSelect.add(startOption);
            endSelect.add(endOption);
        });
    }

    populateStaffOptions() {
        const staffSelect = document.getElementById('staff-filter');
        
        this.staffs.forEach(staff => {
            const option = new Option(staff.name, staff.id);
            staffSelect.add(option);
        });
    }

    setDefaultPeriod() {
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 11, 1); // 12ヶ月前
        const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); // 今月
        
        const startValue = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}`;
        const endValue = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        document.getElementById('start-period').value = startValue;
        document.getElementById('end-period').value = endValue;
    }

    setupPageVisibilityListener() {
        // デバウンス用タイマー
        let refreshTimeout = null;
        
        // ページの表示/非表示状態を監視
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.lastAnalysisData) {
                this.scheduleTransparentRefresh();
            }
        });

        // ページフォーカス時にも更新（ブラウザタブ切り替えで戻った場合）
        window.addEventListener('focus', () => {
            if (this.lastAnalysisData) {
                this.scheduleTransparentRefresh();
            }
        });

        // popstate イベント（戻るボタンで戻った場合）
        window.addEventListener('popstate', () => {
            if (this.lastAnalysisData) {
                this.scheduleTransparentRefresh();
            }
        });
        
    }

    scheduleTransparentRefresh() {
        // 既存のタイマーがあればクリア
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        
        // 500ms後に透明な更新を実行（検索と同じデバウンス感覚）
        this.refreshTimeout = setTimeout(async () => {
            await this.performTransparentRefresh();
        }, 500);
    }

    async performTransparentRefresh() {
        try {
            // 現在のデータのスナップショット
            const beforeData = this.getDataSnapshot();
            
            // データ再読み込み（サイレント）
            await this.loadInitialData();
            
            // 検索欄と同じバリデーション処理を適用
            const startPeriod = document.getElementById('start-period').value;
            const endPeriod = document.getElementById('end-period').value;
            
            if (startPeriod && endPeriod && startPeriod <= endPeriod) {
                await this.performAnalysis();
                
                // データ変更があった場合のみ通知
                const afterData = this.getDataSnapshot();
                if (this.hasDataChanged(beforeData, afterData)) {
                    showToast('データを更新しました', 'success', 1500);
                } else {
                }
            } else {
            }
            
        } catch (error) {
            console.warn('Transparent refresh error (silent):', error);
            // エラーは通知しない（透明な更新のため）
        }
    }

    getDataSnapshot() {
        // データの状態をハッシュ化して比較用スナップショット作成
        const clientUpdates = this.clients?.map(c => c.updated_at).sort().join(',') || '';
        const taskCounts = this.monthlyTasks?.reduce((acc, task) => {
            const completedTasks = Object.values(task.tasks || {}).filter(t => t.completed).length;
            return acc + completedTasks;
        }, 0) || 0;
        
        return {
            clientsCount: this.clients?.length || 0,
            tasksCount: this.monthlyTasks?.length || 0,
            clientUpdates: clientUpdates,
            completedTasksTotal: taskCounts,
            dataTimestamp: Date.now()
        };
    }

    hasDataChanged(before, after) {
        return JSON.stringify(before) !== JSON.stringify(after);
    }

    async refreshAnalyticsData() {
        try {
            
            // フィルター条件を保持したままデータを再読み込み
            await this.loadInitialData();
            
            // 現在のフィルター条件で再分析実行
            await this.performAnalysis();
            
            // ユーザーに更新を通知
            showToast('データを最新状態に更新しました', 'success', 2000);
            
        } catch (error) {
            console.error('Analytics data refresh error:', error);
            showToast('データ更新に失敗しました', 'error');
        }
    }

    setupEventListeners() {
        // 統一ナビゲーションタブはHTMLのリンクで動作するため、イベントリスナー不要


        // クリアフィルターボタン
        document.getElementById('clear-analytics-filters-button').addEventListener('click', async () => {
            await this.clearAllFilters();
        });

        // ソート機能
        document.querySelectorAll('[data-sort]').forEach(header => {
            header.addEventListener('click', (e) => {
                this.sortTable(e.target.dataset.sort);
            });
        });

        // エクスポート機能
        this.setupExportEventListeners();

        // 週次進捗スナップショット保存ボタン（ヘッダー配置）
        const saveSnapshotBtnHeader = document.getElementById('save-snapshot-btn-header');
        if (saveSnapshotBtnHeader) {
            saveSnapshotBtnHeader.addEventListener('click', async () => {
                await this.saveWeeklySnapshot();
                // 保存後にコンパクト版グラフを更新
                await this.updateCompactWeeklyChart();
            });
        }

        // リアルタイムフィルタリング
        this.setupRealtimeFilters();

        // ダッシュボード表示制御
        this.setupDashboardToggle();
    }

    setupRealtimeFilters() {
        const filters = [
            'start-period', 
            'end-period', 
            'staff-filter', 
            'fiscal-month-filter',
            'business-name-filter'
        ];
        
        // デバウンス用のタイマー
        let debounceTimer = null;
        
        const debouncedAnalysis = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                // バリデーション
                const startPeriod = document.getElementById('start-period').value;
                const endPeriod = document.getElementById('end-period').value;
                
                if (startPeriod && endPeriod) {
                    if (startPeriod <= endPeriod) {
                        await this.performAnalysis();
                    } else {
                        // 期間が逆転している場合はサマリーを非表示
                        document.getElementById('summary-dashboard').style.display = 'none';
                        showToast('開始年月は終了年月より前に設定してください', 'warning');
                    }
                }
            }, 300); // 300ms のデバウンス
        };
        
        // 各フィルターにイベントリスナーを追加
        filters.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                if (filterId === 'business-name-filter') {
                    // 事業者名検索は input イベントを使用
                    element.addEventListener('input', debouncedAnalysis);
                } else {
                    element.addEventListener('change', debouncedAnalysis);
                }
            }
        });
    }

    async clearAllFilters() {
        // 期間を初期値（12ヶ月前～今月）にリセット
        this.setDefaultPeriod();
        
        // 担当者フィルターをクリア
        document.getElementById('staff-filter').value = '';
        
        // 決算月フィルターをクリア
        document.getElementById('fiscal-month-filter').value = '';
        
        // 事業者名フィルターをクリア
        document.getElementById('business-name-filter').value = '';
        
        // ソート状態をリセット（デフォルト決算月ソートを適用するため）
        this.currentSort = null;
        this.sortDirection = 'asc';
        
        // ローカルストレージからも削除
        this.clearAnalysisFromLocalStorage();
        
        // 成功メッセージ
        showToast('フィルターをクリアしました', 'success');
        
        // 初期状態で集計を実行
        setTimeout(async () => {
            await this.performAnalysis();
        }, 100); // フィルター変更が反映されてから実行
    }

    // ローカルストレージに分析結果を一時保存
    saveAnalysisToLocalStorage(analysisData, filters) {
        try {
            const saveData = {
                analysisData,
                filters,
                sortState: {
                    currentSort: this.currentSort,
                    sortDirection: this.sortDirection
                },
                timestamp: Date.now(),
                version: '1.1'
            };
            localStorage.setItem('analytics_temp_results', JSON.stringify(saveData));
        } catch (error) {
            console.warn('Failed to save analysis to localStorage:', error);
        }
    }

    // ローカルストレージから分析結果を復元
    restoreAnalysisFromLocalStorage() {
        try {
            const savedData = localStorage.getItem('analytics_temp_results');
            if (!savedData) return false;

            const { analysisData, filters, sortState, timestamp } = JSON.parse(savedData);
            
            // 1時間以内のデータのみ復元
            const oneHour = 60 * 60 * 1000;
            if (Date.now() - timestamp > oneHour) {
                localStorage.removeItem('analytics_temp_results');
                return false;
            }

            // フィルター設定を復元
            if (filters) {
                document.getElementById('start-period').value = filters.startPeriod || '';
                document.getElementById('end-period').value = filters.endPeriod || '';
                document.getElementById('staff-filter').value = filters.staffId || '';
                document.getElementById('fiscal-month-filter').value = filters.fiscalMonth || '';
                document.getElementById('business-name-filter').value = filters.businessName || '';
                
                this.currentFilters = { ...filters };
            }

            // ソート状態を復元
            if (sortState) {
                this.currentSort = sortState.currentSort;
                this.sortDirection = sortState.sortDirection;
            }

            // 分析結果を復元
            if (analysisData) {
                this.lastAnalysisData = analysisData;
                
                // 結果表示
                this.displaySummary(analysisData.summary);
                
                // ソート状態がある場合は適用、ない場合はデフォルト表示
                if (this.currentSort) {
                    const sortedMatrix = this.applySortToMatrix([...analysisData.matrix]);
                    this.displayProgressMatrix(sortedMatrix);
                    this.updateSortIcons(this.currentSort);
                } else {
                    this.displayProgressMatrix(analysisData.matrix);
                }
                
                // サマリーダッシュボード表示
                document.getElementById('summary-dashboard').style.display = 'block';
                
                // エクスポートボタンを有効化
                document.getElementById('export-button').disabled = false;
                
                showToast('前回の集計結果を復元しました', 'info');
                return true;
            }
        } catch (error) {
            console.warn('Failed to restore analysis from localStorage:', error);
            localStorage.removeItem('analytics_temp_results');
        }
        return false;
    }

    // ローカルストレージから分析結果を削除
    clearAnalysisFromLocalStorage() {
        try {
            localStorage.removeItem('analytics_temp_results');
        } catch (error) {
            console.warn('Failed to clear analysis from localStorage:', error);
        }
    }

    async performAnalysis() {
        // 検索時は「集計中」表示を抑制
        if (!this.currentFilters.businessName || this.currentFilters.businessName.trim() === '') {
            toastThrottler.showToast('集計中...', 'info');
        }

        try {
            // 🚀 パフォーマンス最適化: キャッシュをクリア
            this.clearStatsCache();

            // 現在のソート状態を保存
            const previousSortState = {
                currentSort: this.currentSort,
                sortDirection: this.sortDirection
            };

            // フィルター値取得
            this.currentFilters = {
                startPeriod: document.getElementById('start-period').value,
                endPeriod: document.getElementById('end-period').value,
                staffId: document.getElementById('staff-filter').value,
                fiscalMonth: document.getElementById('fiscal-month-filter').value,
                businessName: document.getElementById('business-name-filter').value
            };

            // バリデーション
            if (!this.currentFilters.startPeriod || !this.currentFilters.endPeriod) {
                toastThrottler.showToast('期間を選択してください', 'error');
                return;
            }

            if (this.currentFilters.startPeriod > this.currentFilters.endPeriod) {
                toastThrottler.showToast('開始年月は終了年月より前に設定してください', 'error');
                return;
            }

            // 分析実行
            const analysisData = await this.calculateAnalytics();
            
            // 分析結果を保存（ソートなしの生データ）
            this.lastAnalysisData = analysisData;
            
            // 結果表示
            this.displaySummary(analysisData.summary);
            
            // 既存のソート状態がある場合は復元、ない場合はデフォルト決算月ソート
            if (previousSortState.currentSort) {
                // 既存のソート状態を復元
                this.currentSort = previousSortState.currentSort;
                this.sortDirection = previousSortState.sortDirection;
                
                // ソートを適用して表示
                const sortedMatrix = this.applySortToMatrix([...analysisData.matrix]);
                this.displayProgressMatrix(sortedMatrix);
                this.updateSortIcons(this.currentSort);
                
            } else {
                // デフォルト決算月ソートを適用
                this.applyDefaultFiscalSort();
            }
            
            // ローカルストレージに一時保存
            this.saveAnalysisToLocalStorage(this.lastAnalysisData, this.currentFilters);
            
            // サマリーダッシュボード表示
            document.getElementById('summary-dashboard').style.display = 'block';
            
            // エクスポートボタンを有効化
            document.getElementById('export-button').disabled = false;

            // コンパクト版週次グラフを更新
            await this.updateCompactWeeklyChart();

            // 進捗マトリクス表のタイトルに担当者名を表示
            this.updateMatrixStaffLabel();

            // 検索による集計の場合は控えめな通知
            if (this.currentFilters.businessName && this.currentFilters.businessName.trim() !== '') {
                toastThrottler.showSearchToast('検索結果を更新しました', 'success');
            } else {
                toastThrottler.showToast('集計が完了しました', 'success');
            }

        } catch (error) {
            console.error('Analysis failed:', error);
            toastThrottler.showToast('集計に失敗しました', 'error');
        }
    }

    async calculateAnalytics() {
        
        // フィルター適用済みクライアント取得
        const filteredClients = this.getFilteredClients();
        
        // 期間内の月次タスクデータ取得
        const periodTasks = this.getPeriodTasks(filteredClients);
        
        // サマリー計算
        const summary = this.calculateSummary(filteredClients, periodTasks);
        
        // マトリクス計算
        const matrix = this.calculateMatrix(filteredClients, periodTasks);
        
        return { summary, matrix };
    }

    getFilteredClients() {
        return this.clients.filter(client => {
            // 担当者フィルター
            if (this.currentFilters.staffId && client.staff_id != this.currentFilters.staffId) {
                return false;
            }
            
            // 決算月フィルター
            if (this.currentFilters.fiscalMonth && client.fiscal_month != this.currentFilters.fiscalMonth) {
                return false;
            }
            
            // 事業者名フィルター
            if (this.currentFilters.businessName && this.currentFilters.businessName.trim() !== '') {
                const searchTerm = normalizeText(this.currentFilters.businessName.trim());
                const clientName = normalizeText(client.name);
                if (!clientName.includes(searchTerm)) {
                    return false;
                }
            }

            // 関与終了事業者の表示制御
            const showInactive = !this.hideInactiveClients;
            const matchesStatus = client.status === 'active' || (showInactive && (client.status === 'inactive' || client.status === 'deleted'));
            if (!matchesStatus) {
                return false;
            }

            return true;
        });
    }

    getPeriodTasks(clients) {
        const clientIds = clients.map(c => c.id);
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        return this.monthlyTasks.filter(task => {
            if (!clientIds.includes(task.client_id)) return false;
            
            const taskDate = new Date(task.month + '-01');
            return taskDate >= startDate && taskDate <= endDate;
        });
    }

    calculateSummary(clients, tasks) {
        let totalTasks = 0;
        let completedTasks = 0;

        // 🚀 最適化: キャッシュ付き統計取得を使用
        tasks.forEach(monthlyTask => {
            const stats = this.getTaskStats(monthlyTask);
            totalTasks += stats.totalTasks;
            completedTasks += stats.completedTasks;
        });

        const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // 要注意クライアント（進捗率50%未満 または 遅延・停滞ステータス）
        const attentionClients = [];
        clients.forEach(client => {
            // 🚀 最適化: インデックス検索を使用
            const clientMonthlyTasks = this.getTasksByClientId(client.id);
            let clientTotal = 0;
            let clientCompleted = 0;
            let hasDelayedStatus = false;

            // 🚀 最適化: キャッシュ付き統計取得を使用
            clientMonthlyTasks.forEach(monthlyTask => {
                const stats = this.getTaskStats(monthlyTask);
                clientTotal += stats.totalTasks;
                clientCompleted += stats.completedTasks;

                // 遅延・停滞ステータスチェック
                if (monthlyTask.status === '遅延' || monthlyTask.status === '停滞') {
                    hasDelayedStatus = true;
                }
            });

            const clientProgressRate = clientTotal > 0 ? (clientCompleted / clientTotal) * 100 : 0;

            // 進捗率50%未満 または 遅延・停滞ステータスがある場合
            if ((clientProgressRate < 50 && clientTotal > 0) || hasDelayedStatus) {
                const reason = hasDelayedStatus ? '遅延・停滞' : '進捗率低下';
                // 🚀 最適化: Map検索を使用
                const staff = this.getStaffById(client.staff_id);
                const staffName = staff ? staff.name : '未設定';

                attentionClients.push({
                    id: client.id,
                    name: client.name,
                    progressRate: Math.round(clientProgressRate),
                    staffName: staffName,
                    fiscalMonth: client.fiscal_month,
                    reason: reason
                });
            }
        });
        
        // ステータス別構成を計算
        const statusComposition = this.calculateStatusComposition(tasks);
        
        return {
            progressRate,
            completedTasks,
            totalTasks,
            attentionClients,
            statusComposition
        };
    }

    calculateMatrix(clients, tasks) {
        return clients.map(client => {
            // 🚀 最適化: filter()をインデックス検索に置き換え
            const clientMonthlyTasks = this.getTasksByClientId(client.id);
            let totalTasks = 0;
            let completedTasks = 0;

            // 🚀 最適化: キャッシュ付き統計取得を使用
            clientMonthlyTasks.forEach(monthlyTask => {
                const stats = this.getTaskStats(monthlyTask);
                totalTasks += stats.totalTasks;
                completedTasks += stats.completedTasks;
            });

            const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            // 🚀 最適化: find()をMap検索に置き換え
            const staff = this.getStaffById(client.staff_id);

            // 月別進捗データ
            const monthlyProgress = this.getMonthlyProgressForClient(client.id, tasks);
            
            return {
                clientId: client.id,
                clientName: client.name,
                staffName: staff ? staff.name : '未設定',
                fiscalMonth: client.fiscal_month,
                accountingMethod: client.accounting_method || '-',
                progressRate,
                completedTasks,
                totalTasks,
                monthlyProgress
            };
        });
    }

    getMonthlyProgressForClient(clientId, allTasks) {
        const clientTasks = allTasks.filter(t => t.client_id === clientId);
        const monthlyData = {};
        
        // 期間内の各月について集計
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthTasks = clientTasks.filter(t => t.month === monthKey);
            
            let totalTasks = 0;
            let completedTasks = 0;
            
            // 🚀 最適化: キャッシュ付き統計取得を使用
            monthTasks.forEach(monthlyTask => {
                const stats = this.getTaskStats(monthlyTask);
                totalTasks += stats.totalTasks;
                completedTasks += stats.completedTasks;
            });
            
            monthlyData[monthKey] = {
                completed: completedTasks,
                total: totalTasks,
                rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
            };
        }
        
        return monthlyData;
    }

    displaySummary(summary) {
        document.getElementById('overall-progress').textContent = `${summary.progressRate}%`;
        document.getElementById('completed-tasks').textContent = `${summary.completedTasks} / ${summary.totalTasks}`;
        document.getElementById('attention-clients').textContent = `${summary.attentionClients.length}件`;

        // フィルター情報を表示
        this.updateSummaryFilterInfo();

        // 新しい要注意クライアント表示
        this.displayAttentionClientsNew(summary.attentionClients);

        // 旧要注意クライアントリスト（非表示）
        const attentionContainer = document.getElementById('attention-list');
        if (attentionContainer) attentionContainer.style.display = 'none';

        // ステータス別構成円グラフを描画
        this.drawStatusChart(summary.statusComposition);
    }

    displayAttentionClientsNew(attentionClients) {
        const countElement = document.getElementById('attention-count');
        const listElement = document.getElementById('attention-clients-list');
        const showAllBtn = document.getElementById('show-all-attention-btn');

        // カウント表示
        countElement.textContent = attentionClients.length;

        // リスト表示（最大10件）
        const displayClients = attentionClients.slice(0, 10);
        listElement.innerHTML = '';

        if (attentionClients.length === 0) {
            listElement.innerHTML = '<div style="text-align: center; color: #6c757d; padding: 20px;">要注意クライアントはありません</div>';
            showAllBtn.style.display = 'none';
        } else {
            displayClients.forEach(client => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 4px 6px;
                    margin-bottom: 2px;
                    background: #fff;
                    border-left: 3px solid #dc3545;
                    border-radius: 3px;
                    font-size: 10px;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;
                item.innerHTML = `
                    <a href="details.html?id=${client.id}" style="display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit; width: 100%;">
                        <div style="font-weight: bold; color: #333; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${client.name}
                        </div>
                        <div style="font-size: 9px; color: #dc3545; font-weight: bold; margin: 0 4px; flex-shrink: 0;">
                            ${client.progressRate || 0}%
                        </div>
                        <div style="font-size: 9px; color: #666; flex-shrink: 0; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${client.staffName || '未設定'}
                        </div>
                    </a>
                `;
                item.addEventListener('mouseover', () => item.style.backgroundColor = '#f8f9fa');
                item.addEventListener('mouseout', () => item.style.backgroundColor = '#fff');
                listElement.appendChild(item);
            });

            // 10件超過時のボタン表示
            if (attentionClients.length > 10) {
                showAllBtn.style.display = 'block';
                showAllBtn.textContent = `📋 全 ${attentionClients.length} 件表示`;
            } else {
                showAllBtn.style.display = 'none';
            }
        }

        // 全件表示ボタンのイベントリスナー設定（重複防止）
        if (!showAllBtn.hasAttribute('data-listener-set')) {
            showAllBtn.addEventListener('click', () => this.showAttentionClientsModal(attentionClients));
            showAllBtn.setAttribute('data-listener-set', 'true');
        }
    }

    showAttentionClientsModal(allAttentionClients) {
        const modal = document.getElementById('attention-clients-modal');
        const modalList = document.getElementById('attention-clients-modal-list');

        // モーダル内にすべてのクライアントを表示
        modalList.innerHTML = '';
        allAttentionClients.forEach((client, index) => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 10px;
                margin-bottom: 8px;
                background: #fff;
                border: 1px solid #dee2e6;
                border-left: 4px solid #dc3545;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <span style="font-weight: bold; color: #333;">${index + 1}. ${client.name}</span>
                    <span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: bold;">
                        ${client.progressRate || 0}%
                    </span>
                </div>
                <div style="font-size: 12px; color: #666;">
                    ID: ${client.id} | 担当: ${client.staffName || '未設定'} | 決算月: ${client.fiscalMonth}月
                </div>
            `;
            item.addEventListener('mouseover', () => {
                item.style.backgroundColor = '#f8f9fa';
                item.style.borderLeftColor = '#007bff';
            });
            item.addEventListener('mouseout', () => {
                item.style.backgroundColor = '#fff';
                item.style.borderLeftColor = '#dc3545';
            });
            item.addEventListener('click', () => {
                modal.style.display = 'none';
                this.openClientDetails(client.id);
            });
            modalList.appendChild(item);
        });

        // モーダル表示
        modal.style.display = 'block';

        // 閉じるボタンのイベントリスナー設定（重複防止）
        const closeBtn = document.getElementById('close-attention-modal');
        const closeBtnBottom = document.getElementById('close-attention-modal-btn');
        if (!closeBtn.hasAttribute('data-listener-set')) {
            closeBtn.addEventListener('click', () => modal.style.display = 'none');
            closeBtn.setAttribute('data-listener-set', 'true');
        }
        if (!closeBtnBottom.hasAttribute('data-listener-set')) {
            closeBtnBottom.addEventListener('click', () => modal.style.display = 'none');
            closeBtnBottom.setAttribute('data-listener-set', 'true');
        }

        // 背景クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    openClientDetails(clientId) {
        // 詳細画面を開く（既存機能を利用）
        window.open(`details.html?id=${clientId}`, '_blank');
    }

    updateSummaryFilterInfo() {
        const filterInfoElement = document.getElementById('summary-filter-info');
        if (!filterInfoElement) return;

        const filterParts = [];

        // 集計期間
        if (this.currentFilters.startPeriod && this.currentFilters.endPeriod) {
            const startText = this.formatPeriodText(this.currentFilters.startPeriod);
            const endText = this.formatPeriodText(this.currentFilters.endPeriod);
            filterParts.push(`📅 期間: ${startText} ～ ${endText}`);
        }

        // 担当者フィルター
        if (this.currentFilters.staffId) {
            const selectedStaff = this.staffs.find(s => s.id == this.currentFilters.staffId);
            if (selectedStaff) {
                filterParts.push(`👤 担当者: ${selectedStaff.name}`);
            }
        }

        // 決算月フィルター
        if (this.currentFilters.fiscalMonth) {
            filterParts.push(`📈 決算月: ${this.currentFilters.fiscalMonth}月`);
        }

        // 事業者名フィルター
        if (this.currentFilters.businessName && this.currentFilters.businessName.trim() !== '') {
            filterParts.push(`🏢 事業者名: "${this.currentFilters.businessName.trim()}"`);
        }

        // フィルター情報がない場合のデフォルト表示
        if (filterParts.length === 0) {
            filterInfoElement.innerHTML = `📅 期間: 過去12ヶ月 | 👤 担当者: 全員 | 📈 決算月: 全決算月`;
        } else {
            // 足りない情報は「全て」として補完
            if (!this.currentFilters.staffId) {
                filterParts.push(`👤 担当者: 全員`);
            }
            if (!this.currentFilters.fiscalMonth) {
                filterParts.push(`📈 決算月: 全決算月`);
            }
            filterInfoElement.innerHTML = filterParts.join(' | ');
        }
    }

    formatPeriodText(period) {
        // YYYY-MM 形式を YYYY年MM月 に変換
        const [year, month] = period.split('-');
        return `${year}年${parseInt(month)}月`;
    }

    displayProgressMatrix(matrix) {
        // テーブルヘッダーを更新（月別列を追加）
        this.updateTableHeaders();
        
        const tbody = document.querySelector('#analytics-table tbody');
        tbody.innerHTML = '';
        
        matrix.forEach(row => {
            const tr = document.createElement('tr');

            // 関与終了クライアントのスタイル適用
            const client = this.clients.find(c => c.id === row.clientId);
            if (client && (client.status === 'inactive' || client.status === 'deleted')) {
                tr.classList.add('inactive-client');
            }

            // 基本列（新しい順序：ID、名前、担当者、決算月、進捗率）
            tr.innerHTML = `
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center; position: relative;">
                    <a href="edit.html?id=${row.clientId}"
                       style="color: #007bff; text-decoration: none; cursor: pointer; font-weight: bold;"
                       onmouseover="this.style.textDecoration='underline'; showCustomTooltip(this, 'クリックして編集');"
                       onmouseout="this.style.textDecoration='none'; hideCustomTooltip(this);">
                        ${row.clientId}
                    </a>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center; position: relative;">
                    <a href="details.html?id=${row.clientId}"
                       style="color: #007bff; text-decoration: none; cursor: pointer;"
                       onmouseover="this.style.textDecoration='underline'; showCustomTooltip(this, '詳細画面へ移動');"
                       onmouseout="this.style.textDecoration='none'; hideCustomTooltip(this);">
                        ${row.clientName}
                    </a>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.staffName}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.fiscalMonth}月</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.accountingMethod}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">
                    <span style="font-weight: bold; color: ${this.getProgressColor(row.progressRate)};">
                        ${row.progressRate}%
                    </span>
                </td>
            `;
            
            // クライアント情報を渡して月別進捗列を追加
            const clientData = {
                fiscalMonth: row.fiscalMonth,
                clientName: row.clientName
            };
            this.addMonthlyProgressCells(tr, row.monthlyProgress, clientData);
            
            tbody.appendChild(tr);
        });
    }

    updateTableHeaders() {
        const thead = document.querySelector('#analytics-table thead tr');
        
        // 既存の月別列を削除（基本列のみ残す）
        const monthColumns = thead.querySelectorAll('.month-column');
        monthColumns.forEach(col => col.remove());
        
        // 期間内の月別列を追加
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            
            const th = document.createElement('th');
            th.className = 'month-column';
            th.style.cssText = 'border: 1px solid #dee2e6; padding: 12px; text-align: center; cursor: pointer; background: #f8f9fa; position: sticky; top: 0; z-index: 10;';
            th.setAttribute('data-sort', `month-${monthKey}`);
            
            // 現在のソート状態に基づいてアイコンを設定
            const sortKey = `month-${monthKey}`;
            let iconText = '▲▼';
            let iconColor = '#999';
            
            if (this.currentSort === sortKey) {
                iconText = this.sortDirection === 'asc' ? '▲' : '▼';
                iconColor = '#007bff';
            }
            
            th.innerHTML = `${year}/${month}<br><span class="sort-icon" style="color: ${iconColor};">${iconText}</span>`;
            
            // ソートイベントリスナー追加
            th.addEventListener('click', () => {
                this.sortTableByMonth(monthKey);
            });
            
            thead.appendChild(th);
        }
    }

    addMonthlyProgressCells(tr, monthlyProgress, client) {
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        // クライアントの決算月を取得
        const fiscalMonth = client ? parseInt(client.fiscalMonth) : null;
        
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthData = monthlyProgress[monthKey] || { completed: 0, total: 0, rate: 0 };
            const currentMonth = d.getMonth() + 1; // 1-12
            
            const td = document.createElement('td');
            
            // 基本スタイル
            let borderStyle = '1px solid #dee2e6';
            let backgroundColor = 'transparent';
            let isFiscalMonth = false;
            let isInFiscalYear = false;
            
            // 決算月と会計年度の判定
            if (fiscalMonth) {
                isFiscalMonth = (currentMonth === fiscalMonth);
                
                // 会計年度の開始月は決算月の翌月
                const fiscalYearStart = fiscalMonth === 12 ? 1 : fiscalMonth + 1;
                const fiscalYearEnd = fiscalMonth;
                
                // 会計年度内かどうかを判定
                if (fiscalYearStart <= fiscalYearEnd) {
                    // 通常の年度内（例：4月決算 → 5月-4月）
                    isInFiscalYear = currentMonth >= fiscalYearStart && currentMonth <= fiscalYearEnd;
                } else {
                    // 年跨ぎの年度（例：3月決算 → 4月-3月）
                    isInFiscalYear = currentMonth >= fiscalYearStart || currentMonth <= fiscalYearEnd;
                }
            }
            
            // 決算月の視覚化
            if (isFiscalMonth) {
                backgroundColor = 'rgba(220, 53, 69, 0.05)'; // 薄い赤色の背景
                td.title = `決算月: ${fiscalMonth}月`;
            }
            
            // 基本スタイルを適用
            td.style.cssText = `border: ${borderStyle}; padding: 8px; text-align: center; background-color: ${backgroundColor};`;
            
            // 特別な境界線を後から適用（CSSText上書きを防ぐため）
            if (isFiscalMonth) {
                td.style.borderRight = '4px solid #dc3545'; // 決算月の右境界（赤色）
            }
            
            if (isInFiscalYear) {
                td.style.borderTop = '2px solid #17a2b8'; // 会計年度内の上下境界（青色）
                td.style.borderBottom = '2px solid #17a2b8';
            }
            
            if (monthData.total > 0) {
                const progressColor = this.getProgressColor(monthData.rate);

                // 分子が1の場合（資料受付完了状態）に📋アイコンを追加
                let progressText = `${monthData.completed}/${monthData.total}`;
                if (monthData.completed === 1) {
                    progressText = `📋 ${progressText}`;
                }

                td.innerHTML = `
                    <div style="background: ${progressColor}; color: white; padding: 4px 6px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${progressText}
                    </div>
                `;
            } else {
                td.innerHTML = '<span style="color: #999;">-</span>';
            }
            
            tr.appendChild(td);
        }
    }

    sortTableByMonth(monthKey) {
        
        if (!this.lastAnalysisData || !this.lastAnalysisData.matrix) {
            showToast('先に集計を実行してください', 'info');
            return;
        }

        const sortKey = `month-${monthKey}`;
        
        // ソート状態管理
        if (this.currentSort === sortKey) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = sortKey;
            this.sortDirection = 'asc';
        }

        // ソート実行
        let sortedMatrix = [...this.lastAnalysisData.matrix];
        
        sortedMatrix.sort((a, b) => {
            const aData = a.monthlyProgress[monthKey] || { rate: -1 };
            const bData = b.monthlyProgress[monthKey] || { rate: -1 };
            
            const result = aData.rate - bData.rate;
            return this.sortDirection === 'asc' ? result : -result;
        });

        // ソートアイコン更新
        this.updateSortIcons(sortKey);
        
        // 表示更新
        this.displayProgressMatrix(sortedMatrix);
        
        const [year, month] = monthKey.split('-');
        showToast(`${year}年${month}月の進捗率で${this.sortDirection === 'asc' ? '昇順' : '降順'}ソート`, 'success');
    }

    getProgressColor(rate) {
        if (rate >= 80) return '#28a745'; // 緑
        if (rate >= 50) return '#ffc107'; // 黄
        return '#dc3545'; // 赤
    }

    sortTable(sortBy) {
        
        if (!this.lastAnalysisData || !this.lastAnalysisData.matrix) {
            showToast('先に集計を実行してください', 'info');
            return;
        }

        // 現在のソート状態を管理
        if (this.currentSort === sortBy) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = sortBy;
            this.sortDirection = 'asc';
        }

        // ソート実行
        let sortedMatrix = [...this.lastAnalysisData.matrix];
        
        sortedMatrix.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'id':
                    aValue = parseInt(a.clientId) || 0;
                    bValue = parseInt(b.clientId) || 0;
                    break;
                case 'name':
                    aValue = a.clientName;
                    bValue = b.clientName;
                    break;
                case 'progress':
                    aValue = a.progressRate;
                    bValue = b.progressRate;
                    break;
                case 'staff':
                    aValue = a.staffName || '';
                    bValue = b.staffName || '';
                    break;
                case 'fiscal':
                    aValue = parseInt(a.fiscalMonth) || 0;
                    bValue = parseInt(b.fiscalMonth) || 0;
                    break;
                case 'accounting':
                    aValue = a.accountingMethod || '';
                    bValue = b.accountingMethod || '';
                    break;
                default:
                    return 0;
            }
            
            // 文字列の場合
            if (typeof aValue === 'string') {
                const result = aValue.localeCompare(bValue, 'ja');
                return this.sortDirection === 'asc' ? result : -result;
            }
            
            // 数値の場合
            const result = aValue - bValue;
            return this.sortDirection === 'asc' ? result : -result;
        });

        // ソートアイコン更新
        this.updateSortIcons(sortBy);
        
        // 表示更新
        this.displayProgressMatrix(sortedMatrix);
        
        const sortNames = {
            'id': '事業者ID',
            'name': '事業者名',
            'progress': '進捗率',
            'staff': '担当者',
            'fiscal': '決算月',
            'accounting': '経理方式'
        };
        showToast(`${sortNames[sortBy]}で${this.sortDirection === 'asc' ? '昇順' : '降順'}ソート`, 'success');
    }

    updateSortIcons(activeSortBy) {
        // 全てのソートアイコンをリセット
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.textContent = '▲▼';
            icon.style.color = '#999';
        });

        // アクティブなソートアイコンを更新
        const activeHeader = document.querySelector(`[data-sort="${activeSortBy}"] .sort-icon`);
        if (activeHeader) {
            activeHeader.textContent = this.sortDirection === 'asc' ? '▲' : '▼';
            activeHeader.style.color = '#007bff';
        }
    }

    handleUrlParameters() {
        // URLパラメータを取得
        const urlParams = new URLSearchParams(window.location.search);
        const staffId = urlParams.get('staff');
        
        if (staffId) {
            
            // 担当者フィルターを自動選択
            const staffSelect = document.getElementById('staff-filter');
            if (staffSelect) {
                staffSelect.value = staffId;
                
                // フィルターの状態を内部的にも更新
                this.currentFilters.staffId = staffId;
                
                // 選択された担当者名を表示
                const selectedStaff = this.staffs.find(s => s.id == staffId);
                if (selectedStaff) {
                    showToast(`担当者「${selectedStaff.name}」の進捗分析を表示中`, 'info');
                    
                    // ローカルストレージをクリアして新規分析を強制実行
                    this.clearAnalysisFromLocalStorage();
                    
                    // より短いタイマーで確実に実行
                    setTimeout(async () => {
                        await this.performAnalysis();
                    }, 300);
                } else {
                    console.warn(`Staff with ID ${staffId} not found`);
                    showToast('指定された担当者が見つかりません', 'warning');
                }
            }
            
            return true; // URLパラメータがあることを示す
        }
        
        return false; // URLパラメータがないことを示す
    }

    setupExportEventListeners() {
        // エクスポートボタンクリックでメニュー表示切り替え
        document.getElementById('export-button').addEventListener('click', () => {
            const menu = document.getElementById('export-menu');
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.export-dropdown')) {
                document.getElementById('export-menu').style.display = 'none';
            }
        });
    }

    exportToCSV() {
        if (!this.lastAnalysisData) {
            showToast('先に集計を実行してください', 'warning');
            return;
        }

        try {
            const csvData = this.generateCSVData();
            this.downloadCSV(csvData, `進捗分析結果_${this.getCurrentDateString()}.csv`);
            showToast('CSV形式でエクスポートしました', 'success');
            document.getElementById('export-menu').style.display = 'none';
        } catch (error) {
            console.error('CSV export failed:', error);
            showToast('CSVエクスポートに失敗しました', 'error');
        }
    }

    exportToExcel(format = 'basic') {
        if (!this.lastAnalysisData) {
            showToast('先に集計を実行してください', 'warning');
            return;
        }

        try {
            let formatName = '';
            switch(format) {
                case 'table':
                    formatName = '（テーブル形式）';
                    break;
                case 'styled':
                    formatName = '（高機能形式）';
                    break;
                default:
                    formatName = '（基本形式）';
            }

            const excelData = this.generateExcelData(format);
            this.downloadExcel(excelData, `進捗分析結果${formatName}_${this.getCurrentDateString()}.xlsx`);
            showToast(`Excel形式${formatName}でエクスポートしました`, 'success');
            document.getElementById('export-menu').style.display = 'none';
        } catch (error) {
            console.error('Excel export failed:', error);
            showToast('Excelエクスポートに失敗しました', 'error');
        }
    }

    exportToPDF() {
        if (!this.lastAnalysisData) {
            showToast('先に集計を実行してください', 'warning');
            return;
        }

        try {
            this.generatePDFReport();
            showToast('PDF形式でエクスポートしました', 'success');
            document.getElementById('export-menu').style.display = 'none';
        } catch (error) {
            console.error('PDF export failed:', error);
            showToast('PDFエクスポートに失敗しました', 'error');
        }
    }

    generateCSVData() {
        const { summary } = this.lastAnalysisData;
        const matrix = this.getSortedMatrix(); // ソート済みデータを取得
        let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility

        // サマリー情報
        csvContent += '集計結果サマリー\n';
        csvContent += `集計期間,${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}\n`;
        
        // フィルター条件を追加
        const filterInfo = this.getFilterInfo();
        if (filterInfo.length > 0) {
            csvContent += `検索条件,${filterInfo.join(' | ')}\n`;
        }
        
        // ソート情報を追加
        const sortInfo = this.getSortInfo();
        if (sortInfo) {
            csvContent += `並び順,${sortInfo}\n`;
        }
        
        csvContent += `全体進捗率,${summary.progressRate}%\n`;
        csvContent += `完了タスク,${summary.completedTasks} / ${summary.totalTasks}\n`;
        csvContent += `要注意クライアント,${summary.attentionClients.length}件\n`;
        
        // 要注意クライアント詳細
        if (summary.attentionClients.length > 0) {
            csvContent += '要注意クライアント詳細\n';
            csvContent += 'クライアント名,理由,進捗率\n';
            summary.attentionClients.forEach(client => {
                csvContent += `"${client.name}",${client.reason},${client.progressRate}%\n`;
            });
        }
        csvContent += '\n';

        // 進捗マトリクス表
        csvContent += '進捗マトリクス表\n';
        
        // ヘッダー行
        const headers = ['ID', '事業者名', '担当者', '決算月', '経理方式', '進捗率'];
        
        // 月別ヘッダーを追加
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            headers.push(`${year}年${month}月進捗`);
        }
        
        csvContent += headers.join(',') + '\n';

        // データ行
        matrix.forEach(row => {
            const dataRow = [
                row.clientId,
                `"${row.clientName}"`,
                `"${row.staffName}"`,
                `${row.fiscalMonth}月`,
                `"${row.accountingMethod || '記帳代行'}"`,
                `${row.progressRate}%`
            ];

            // 月別データを追加
            for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
                const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                const monthData = row.monthlyProgress[monthKey] || { completed: 0, total: 0, rate: 0 };
                // Excel/CSV で日付として認識されないよう、タブ文字で開始して文字列として強制
                if (monthData.total > 0) {
                    dataRow.push(`="${monthData.completed}/${monthData.total}"`);
                } else {
                    dataRow.push('"-"');
                }
            }

            csvContent += dataRow.join(',') + '\n';
        });

        return csvContent;
    }

    generateExcelData(format = 'basic') {
        const { summary } = this.lastAnalysisData;
        const matrix = this.getSortedMatrix(); // ソート済みデータを取得
        
        // Excelワークブック作成
        const workbook = XLSX.utils.book_new();
        
        // サマリーと進捗マトリクスを1つのシートに統合
        const combinedSheet = this.createCombinedSheet(summary, matrix, format);
        XLSX.utils.book_append_sheet(workbook, combinedSheet, '分析結果');
        
        return workbook;
    }
    
    createCombinedSheet(summary, matrix, format = 'basic') {
        const data = [];
        
        // === サマリーセクション ===
        data.push(['📊 集計結果サマリー']);
        data.push(['']);
        data.push(['集計期間', `${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}`]);
        
        // フィルター条件を追加
        const filterInfo = this.getFilterInfo();
        if (filterInfo.length > 0) {
            data.push(['検索条件', filterInfo.join(' | ')]);
        }
        
        // ソート情報を追加
        const sortInfo = this.getSortInfo();
        if (sortInfo) {
            data.push(['並び順', sortInfo]);
        }
        
        data.push(['全体進捗率', `${summary.progressRate}%`]);
        data.push(['完了タスク', `${summary.completedTasks} / ${summary.totalTasks}`]);
        data.push(['要注意クライアント', `${summary.attentionClients.length}件`]);
        data.push(['']);
        
        // 要注意クライアント詳細
        if (summary.attentionClients.length > 0) {
            data.push(['⚠️ 要注意クライアント詳細']);
            data.push(['クライアント名', '理由', '進捗率']);
            summary.attentionClients.forEach(client => {
                data.push([client.name, client.reason, `${client.progressRate}%`]);
            });
            data.push(['']);
        }
        
        // === 進捗マトリクスセクション ===
        data.push(['📋 進捗マトリクス表']);
        data.push(['']);
        
        // マトリクスヘッダー行作成
        const periods = Object.keys(matrix[0].monthlyProgress || {}).sort();
        const headers = ['ID', '事業者名', '担当者', '決算月', '経理方式', '進捗率', ...periods];
        data.push(headers);
        
        // マトリクスデータ行作成
        matrix.forEach(client => {
            const row = [
                client.clientId,
                client.clientName,
                client.staffName || '',
                `${client.fiscalMonth}月`,
                client.accountingMethod || '記帳代行',
                this.formatProgressForExcel(client.completedTasks, client.totalTasks)
            ];
            
            // 各月の進捗を分数形式で追加（日付と間違われないように対策）
            periods.forEach(period => {
                const monthData = client.monthlyProgress?.[period];
                if (monthData) {
                    row.push(this.formatProgressForExcel(monthData.completed, monthData.total));
                } else {
                    row.push('');
                }
            });
            
            data.push(row);
        });
        
        // ワークシート作成
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        
        // マトリクス部分のヘッダー行インデックスを計算
        const matrixHeaderRowIndex = summary.attentionClients.length > 0 ? 
            9 + summary.attentionClients.length : 8;
        
        // フォーマットに応じた追加処理
        if (format === 'basic') {
            this.setColumnWidths(worksheet, data, headers);
        } else if (format === 'table') {
            this.setColumnWidths(worksheet, data, headers);
            this.applyCombinedHeaderStyling(worksheet, data, matrixHeaderRowIndex, headers);
        } else if (format === 'styled') {
            this.setColumnWidths(worksheet, data, headers);
            this.applyCombinedHeaderStyling(worksheet, data, matrixHeaderRowIndex, headers);
            this.applyCombinedConditionalFormatting(worksheet, data, matrixHeaderRowIndex);
        }
        
        return worksheet;
    }
    
    createSummarySheet(summary, format = 'basic') {
        const data = [
            ['集計結果サマリー'],
            [''],
            ['集計期間', `${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}`],
            ['全体進捗率', `${summary.progressRate}%`],
            ['完了タスク', `${summary.completedTasks} / ${summary.totalTasks}`],
            ['要注意クライアント', `${summary.attentionClients.length}件`],
            [''],
            ['要注意クライアント詳細'],
            ['クライアント名', '理由', '進捗率']
        ];
        
        // 要注意クライアント詳細を追加
        summary.attentionClients.forEach(client => {
            data.push([client.name, client.reason, `${client.progressRate}%`]);
        });
        
        return XLSX.utils.aoa_to_sheet(data);
    }
    
    createMatrixSheet(matrix, format = 'basic') {
        const data = [];
        
        // ヘッダー行作成
        const periods = Object.keys(matrix[0].monthlyProgress || {}).sort();
        const headers = ['事業者名', '担当者', '全体進捗率', ...periods];
        data.push(headers);
        
        // データ行作成
        matrix.forEach(client => {
            const row = [
                client.clientName,
                client.staffName || '',
                this.formatProgressForExcel(client.completedTasks, client.totalTasks)
            ];
            
            // 各月の進捗を分数形式で追加（日付と間違われないように対策）
            periods.forEach(period => {
                const monthData = client.monthlyProgress?.[period];
                if (monthData) {
                    row.push(this.formatProgressForExcel(monthData.completed, monthData.total));
                } else {
                    row.push('');
                }
            });
            
            data.push(row);
        });
        
        // ワークシート作成
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        
        // フォーマットに応じた追加処理
        if (format === 'basic') {
            // 基本形式：最低限のフォーマットのみ
            this.applyBasicFormatting(worksheet, data, headers);
        } else if (format === 'table') {
            // テーブル形式：フィルタリング・ソート機能付き
            this.applyTableFormatting(worksheet, data, headers);
        } else if (format === 'styled') {
            // 高機能形式：テーブル + 条件付き書式 + スタイル
            this.applyTableFormatting(worksheet, data, headers);
            this.applyAdvancedStyling(worksheet, data, headers);
        }
        
        return worksheet;
    }
    
    applyTableFormatting(worksheet, data, headers) {
        // SheetJS Community Edition制限により、テーブル形式は利用できません
        // 代わりに基本的なフォーマットを適用
        
        // 列幅自動調整
        this.setColumnWidths(worksheet, data, headers);
        
        // ヘッダー行の基本的なスタイル（可能な範囲で）
        this.applyHeaderStyling(worksheet, headers);
    }
    
    applyBasicFormatting(worksheet, data, headers) {
        // 基本的な列幅設定のみ
        this.setColumnWidths(worksheet, data, headers);
    }
    
    applyAdvancedStyling(worksheet, data, headers) {
        // ヘッダー行のスタイル設定
        for (let i = 0; i < headers.length; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
            if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
            
            worksheet[cellRef].s = {
                fill: { fgColor: { rgb: "366092" } },
                font: { color: { rgb: "FFFFFF" }, bold: true },
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                    top: { style: "thin", color: { rgb: "000000" } },
                    bottom: { style: "thin", color: { rgb: "000000" } },
                    left: { style: "thin", color: { rgb: "000000" } },
                    right: { style: "thin", color: { rgb: "000000" } }
                }
            };
        }
        
        // 条件付き書式（進捗率に応じた色分け）
        this.applyConditionalFormatting(worksheet, data, headers);
        
        // 行の高さ設定
        if (!worksheet['!rows']) worksheet['!rows'] = [];
        for (let i = 0; i < data.length; i++) {
            worksheet['!rows'][i] = { hpt: 20 };
        }
    }
    
    setColumnWidths(worksheet, data, headers) {
        const colWidths = [];
        for (let i = 0; i < headers.length; i++) {
            let maxWidth = headers[i].length;
            for (let j = 1; j < data.length; j++) {
                if (data[j][i]) {
                    maxWidth = Math.max(maxWidth, String(data[j][i]).length);
                }
            }
            colWidths.push({ wch: Math.min(maxWidth + 2, 20) });
        }
        worksheet['!cols'] = colWidths;
    }
    
    applyHeaderStyling(worksheet, headers) {
        // SheetJS Community Edition での基本的なヘッダースタイル
        for (let i = 0; i < headers.length; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
            if (worksheet[cellRef]) {
                // セル値にマークを追加して視覚的に強調
                worksheet[cellRef].v = `【${headers[i]}】`;
            }
        }
    }
    
    applyConditionalFormatting(worksheet, data, headers) {
        // SheetJS Community Edition制限により、条件付き書式は利用できません
        
        // 代わりに進捗率の数値表現を改善（テキストレベルでの視覚化）
        const progressColIndex = 2; // 全体進捗率の列
        
        for (let row = 1; row < data.length; row++) {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: progressColIndex });
            if (worksheet[cellRef] && worksheet[cellRef].v) {
                const progressText = String(worksheet[cellRef].v).trim();
                const match = progressText.match(/(\d+)\/(\d+)/);
                
                if (match) {
                    const completed = parseInt(match[1]);
                    const total = parseInt(match[2]);
                    const rate = (completed / total) * 100;
                    
                    // 進捗率に応じた視覚的な表現を追加
                    let statusIcon = '';
                    if (rate >= 80) {
                        statusIcon = '✅'; // 完了
                    } else if (rate >= 50) {
                        statusIcon = '⚠️'; // 注意
                    } else {
                        statusIcon = '🔴'; // 遅延
                    }
                    
                    // セルの値を更新（アイコン付き）
                    worksheet[cellRef].v = `${statusIcon} ${progressText}`;
                }
            }
        }
    }
    
    applyCombinedHeaderStyling(worksheet, data, matrixHeaderRowIndex, headers) {
        // 統合シートのヘッダー強調
        for (let i = 0; i < headers.length; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: matrixHeaderRowIndex, c: i });
            if (worksheet[cellRef]) {
                worksheet[cellRef].v = `【${headers[i]}】`;
            }
        }
    }
    
    applyCombinedConditionalFormatting(worksheet, data, matrixHeaderRowIndex) {
        // 統合シートの進捗アイコン追加
        const progressColIndex = 2; // 全体進捗率の列
        const startDataRow = matrixHeaderRowIndex + 1;
        
        for (let row = startDataRow; row < data.length; row++) {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: progressColIndex });
            if (worksheet[cellRef] && worksheet[cellRef].v) {
                const progressText = String(worksheet[cellRef].v).trim();
                const match = progressText.match(/(\d+)\/(\d+)/);
                
                if (match) {
                    const completed = parseInt(match[1]);
                    const total = parseInt(match[2]);
                    const rate = (completed / total) * 100;
                    
                    let statusIcon = '';
                    if (rate >= 80) {
                        statusIcon = '✅';
                    } else if (rate >= 50) {
                        statusIcon = '⚠️';
                    } else {
                        statusIcon = '🔴';
                    }
                    
                    worksheet[cellRef].v = `${statusIcon} ${progressText}`;
                }
            }
        }
    }
    
    formatProgressForExcel(completed, total) {
        if (!total || total === 0) return '';
        
        // 日付と間違われないように対策：
        // 1. 前後にスペースを入れる
        // 2. 文字列として明示的にフォーマット
        return ` ${completed}/${total} `;
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    downloadExcel(workbook, filename) {
        // SheetJSでワークブックをExcelバイナリに変換
        const excelBuffer = XLSX.write(workbook, { 
            bookType: 'xlsx', 
            type: 'array',
            compression: true
        });
        
        // 正しいMIMEタイプでダウンロード
        const blob = new Blob([excelBuffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    getCurrentDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        return `${year}${month}${day}_${hour}${minute}`;
    }

    generatePDFReport() {
        // 現在のダッシュボードと同じ見た目でPDF生成
        const { summary } = this.lastAnalysisData;
        const matrix = this.getSortedMatrix();

        // 新しいウィンドウでPDF用のレポートページを開く
        const printWindow = window.open('', '_blank');

        // 現在のページのCSSを取得（外部CSSファイルの内容を含む）
        const currentCSS = this.getCurrentPageCSS();

        const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>進捗管理ダッシュボード - ${this.getCurrentDateString()}</title>
            <meta charset="UTF-8">
            <style>
                @page {
                    size: A4 landscape;
                    margin: 10mm;
                }

                /* 現在のページのCSSをベースに */
                ${currentCSS}

                /* PDF印刷用の調整 */
                body {
                    background: white !important;
                    color: black !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 11px;
                    line-height: 1.4;
                    margin: 0;
                    padding: 20px;
                }

                /* ナビゲーション要素を非表示 */
                .navigation, .controls-section, .export-section, .sort-icon,
                button, .btn, .filter-section {
                    display: none !important;
                }

                /* テーブルスタイルを画面と同じに */
                .table-container {
                    overflow: visible !important;
                    max-height: none !important;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    margin: 20px 0;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                    background: white;
                }

                th, td {
                    border: 1px solid #dee2e6 !important;
                    text-align: center;
                    vertical-align: middle;
                }

                /* ヘッダーは現在のパディングを維持 */
                th {
                    padding: 6px 4px !important;
                    line-height: 1.4;
                }

                /* データ行はより小さなパディング */
                td {
                    padding: 2px 1px !important;
                    line-height: 1.1;
                }

                /* 年月列の幅を統一 */
                th:nth-child(n+5), td:nth-child(n+5) {
                    width: 50px;
                    min-width: 45px;
                    max-width: 55px;
                }

                th {
                    background: #f8f9fa !important;
                    font-weight: bold;
                    color: black !important;
                    position: static !important;
                }

                /* 進捗率の色を維持 */
                .progress-text-high { color: #28a745 !important; font-weight: bold; }
                .progress-text-medium { color: #ffc107 !important; font-weight: bold; }
                .progress-text-low { color: #dc3545 !important; font-weight: bold; }

                /* 月別進捗セルの色を維持 */
                td div[style*="background"] {
                    color: white !important;
                    font-weight: bold !important;
                    padding: 4px 6px !important;
                    border-radius: 4px !important;
                    font-size: 10px !important;
                    white-space: nowrap;
                }

                /* サマリーセクション */
                .summary-section {
                    margin: 20px 0;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }

                .summary-section h2 {
                    margin-bottom: 10px;
                    color: #333;
                }

                /* ヘッダー */
                .pdf-header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #007bff;
                }

                .pdf-header h1 {
                    font-size: 24px;
                    color: #007bff;
                    margin-bottom: 10px;
                }


                /* 改ページ制御 */
                .page-break {
                    page-break-before: always;
                }

                /* リンクスタイル */
                a {
                    color: #007bff !important;
                    text-decoration: none !important;
                }

                @media print {
                    body {
                        -webkit-print-color-adjust: exact !important;
                        color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    /* 決算月の境界線を強制表示 */
                    td[style*="border-right: 4px solid #dc3545"] {
                        border-right: 4px solid #dc3545 !important;
                        background-color: rgba(220, 53, 69, 0.05) !important;
                    }

                    /* 会計年度の境界線を強制表示 */
                    td[style*="border-top: 2px solid #17a2b8"] {
                        border-top: 2px solid #17a2b8 !important;
                        border-bottom: 2px solid #17a2b8 !important;
                    }
                }
            </style>
        </head>
        <body>
            <div class="pdf-header">
                <h1>📊 進捗管理ダッシュボード</h1>
                <div style="font-size: 12px; color: #666; margin: 10px 0; line-height: 1.6;">
                    <span style="font-weight: bold;">作成日時:</span> ${new Date().toLocaleString('ja-JP')} |
                    <span style="font-weight: bold;">集計期間:</span> ${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}
                    ${this.getFilterInfo().length > 0 ? ` | <span style="font-weight: bold;">検索条件:</span> ${this.getFilterInfo().join(' | ')}` : ''}
                    ${this.getSortInfo() ? ` | <span style="font-weight: bold;">並び順:</span> ${this.getSortInfo()}` : ''}
                </div>
            </div>

            <div class="summary-section">
                <h2>📈 集計結果サマリー</h2>
                <div style="margin: 15px 0; line-height: 1.8; font-size: 14px;">
                    <span style="font-weight: bold;">全体進捗率:</span> ${summary.progressRate}% |
                    <span style="font-weight: bold;">完了タスク:</span> ${summary.completedTasks} |
                    <span style="font-weight: bold;">総タスク数:</span> ${summary.totalTasks} |
                    <span style="font-weight: bold;">要注意クライアント:</span> ${summary.attentionClients.length}件
                </div>
            </div>

            <div class="table-container">
                ${this.generateDashboardStyleTable(matrix)}
            </div>
        </body>
        </html>`;
        
        printWindow.document.write(printContent);
        printWindow.document.close();

        // PDFとして印刷
        printWindow.onload = function() {
            printWindow.print();
            printWindow.onafterprint = function() {
                printWindow.close();
            };
        };
    }

    getCurrentPageCSS() {
        // 基本的なCSSのみを返す（簡略化）
        return `
            /* 基本的なテーブルスタイル */
            .table-responsive table {
                border-collapse: collapse;
                width: 100%;
            }
            .table-responsive th,
            .table-responsive td {
                border: 1px solid #dee2e6;
                padding: 8px;
                text-align: center;
            }
            .table-responsive th {
                background-color: #f8f9fa;
                font-weight: bold;
            }
        `;
    }

    generateDashboardStyleTable(matrix) {
        if (!matrix || matrix.length === 0) return '<p>データがありません</p>';

        // 期間内の月を取得
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        const months = [];

        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            months.push({ key: monthKey, year, month });
        }

        // テーブルヘッダー
        const headerHTML = `
        <thead>
            <tr>
                <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">ID</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">事業者名</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">担当者</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">決算月</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">経理方式</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">進捗率</th>
                ${months.map(month =>
                    `<th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; background: #f8f9fa;">${month.year}/${month.month}</th>`
                ).join('')}
            </tr>
        </thead>`;

        // テーブルボディ
        const bodyHTML = `<tbody>${matrix.map(row => {
            const fiscalMonth = row.fiscalMonth;

            return `<tr>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.clientId}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px;">
                    <a href="details.html?id=${row.clientId}" style="color: #007bff; text-decoration: none;">
                        ${row.clientName}
                    </a>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.staffName}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.fiscalMonth}月</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.accountingMethod || '記帳代行'}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">
                    <span style="font-weight: bold; color: ${this.getProgressColor(row.progressRate)};">
                        ${row.progressRate}%
                    </span>
                </td>
                ${months.map(month => {
                    const monthData = row.monthlyProgress[month.key] || { completed: 0, total: 0, rate: 0 };
                    const currentMonth = month.month;

                    let cellStyle = 'border: 1px solid #dee2e6; padding: 2px; text-align: center;';
                    let cellContent = '';

                    // 決算月の視覚化
                    if (fiscalMonth && currentMonth === fiscalMonth) {
                        cellStyle += ' border-right: 4px solid #dc3545 !important; background-color: rgba(220, 53, 69, 0.05) !important;';
                    } else {
                        // 会計年度の判定
                        const fiscalYearStart = fiscalMonth === 12 ? 1 : fiscalMonth + 1;
                        const fiscalYearEnd = fiscalMonth;
                        let isInFiscalYear = false;

                        if (fiscalYearStart <= fiscalYearEnd) {
                            isInFiscalYear = currentMonth >= fiscalYearStart && currentMonth <= fiscalYearEnd;
                        } else {
                            isInFiscalYear = currentMonth >= fiscalYearStart || currentMonth <= fiscalYearEnd;
                        }

                        if (isInFiscalYear) {
                            cellStyle += ' border-top: 2px solid #17a2b8 !important; border-bottom: 2px solid #17a2b8 !important;';
                        }
                    }

                    if (monthData.total > 0) {
                        const progressColor = this.getProgressColor(monthData.rate);

                        // 分子が1の場合に📋アイコンを追加
                        let progressText = `${monthData.completed}/${monthData.total}`;
                        if (monthData.completed === 1) {
                            progressText = `📋 ${progressText}`;
                        }

                        cellContent = `<div style="background: ${progressColor}; color: white; padding: 1px 3px; border-radius: 2px; font-size: 8px; font-weight: bold; white-space: nowrap;">${progressText}</div>`;
                    } else {
                        cellContent = '<span style="color: #999;">-</span>';
                    }

                    return `<td style="${cellStyle}">${cellContent}</td>`;
                }).join('')}
            </tr>`;
        }).join('')}</tbody>`;

        return `<table style="width: 100%; border-collapse: collapse; font-size: 9px;">${headerHTML}${bodyHTML}</table>`;
    }

    generateMonthlyProgressTable(matrix) {
        if (!matrix || matrix.length === 0) return '<p>データがありません</p>';
        
        // 期間内の月を取得
        const periods = Object.keys(matrix[0].monthlyProgress || {}).sort();
        
        // テーブルヘッダー（決算月情報付き）
        const headers = ['事業者名', '担当者', '全体進捗', ...periods.map(period => {
            const [year, month] = period.split('-');
            return `${year}/${month}`;
        })];
        
        return `
        <table style="font-size: 8px; border-collapse: collapse; width: 100%;">
            <thead>
                <tr style="background-color: #f8f9fa;">
                    ${headers.map((header, index) => {
                        if (index < 3) {
                            return `<th style="padding: 8px 4px; border: 1px solid #333; text-align: center; font-weight: bold;">${header}</th>`;
                        } else {
                            return `<th style="padding: 8px 4px; border: 1px solid #333; text-align: center; font-weight: bold; writing-mode: horizontal-tb;">${header}</th>`;
                        }
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                ${matrix.map(client => {
                    // 全体進捗の色分けクラスを決定
                    const overallRate = client.totalTasks > 0 ? 
                        Math.round((client.completedTasks / client.totalTasks) * 100) : 0;
                    const overallClass = overallRate >= 80 ? 'progress-high' : 
                                        overallRate >= 50 ? 'progress-medium' : 'progress-low';
                    const fiscalMonth = parseInt(client.fiscalMonth);
                    
                    return `
                    <tr>
                        <td style="text-align: left; font-weight: bold; padding: 6px 4px; border: 1px solid #333; background-color: #fafafa;">${client.clientName}</td>
                        <td style="padding: 6px 4px; border: 1px solid #333; text-align: center;">${client.staffName || '-'}</td>
                        <td class="${overallClass}" style="padding: 6px 4px; border: 1px solid #333; text-align: center; font-weight: bold;">${overallRate}% (${client.completedTasks}/${client.totalTasks})</td>
                        ${periods.map(period => {
                            const [year, month] = period.split('-');
                            const currentMonth = parseInt(month);
                            const monthData = client.monthlyProgress?.[period];
                            
                            if (!monthData) {
                                return `<td style="padding: 6px 4px; border: 1px solid #333; text-align: center;">-</td>`;
                            }
                            
                            const monthRate = monthData.total > 0 ? 
                                Math.round((monthData.completed / monthData.total) * 100) : 0;
                            const monthClass = monthRate >= 80 ? 'progress-high' : 
                                              monthRate >= 50 ? 'progress-medium' : 'progress-low';
                            
                            // 決算月の特別スタイル
                            let cellStyle = 'padding: 6px 4px; border: 1px solid #333; text-align: center; font-weight: bold;';
                            let cellContent = `${monthData.completed}/${monthData.total}`;

                            // 分子が1の場合（資料受付完了状態）に📋アイコンを追加
                            if (monthData.completed === 1) {
                                cellContent = `📋 ${cellContent}`;
                            }
                            
                            if (fiscalMonth && currentMonth === fiscalMonth) {
                                // 決算月は赤色の太い境界線と背景色
                                cellStyle += ' border-right: 4px solid #dc3545 !important; background-color: rgba(220, 53, 69, 0.1);';
                                cellContent += ' 📅'; // 決算月アイコン
                            } else {
                                // 会計年度期間の判定と表示
                                const fiscalYearStart = fiscalMonth === 12 ? 1 : fiscalMonth + 1;
                                const fiscalYearEnd = fiscalMonth;
                                
                                let isInFiscalYear = false;
                                if (fiscalYearStart <= fiscalYearEnd) {
                                    isInFiscalYear = currentMonth >= fiscalYearStart && currentMonth <= fiscalYearEnd;
                                } else {
                                    isInFiscalYear = currentMonth >= fiscalYearStart || currentMonth <= fiscalYearEnd;
                                }
                                
                                if (isInFiscalYear) {
                                    cellStyle += ' border-top: 3px solid #17a2b8; border-bottom: 3px solid #17a2b8;';
                                }
                            }
                            
                            return `<td class="${monthClass}" style="${cellStyle}">${cellContent}</td>`;
                        }).join('')}
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        <div style="margin-top: 15px; font-size: 10px; line-height: 1.6;">
            <div style="margin-bottom: 8px;">
                <strong>📊 進捗率の色分け:</strong> 
                <span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; margin: 0 3px; color: #155724;">■ 80%以上（良好）</span>
                <span style="background-color: #fff3cd; padding: 2px 6px; border-radius: 3px; margin: 0 3px; color: #856404;">■ 50-79%（注意）</span>
                <span style="background-color: #f8d7da; padding: 2px 6px; border-radius: 3px; margin: 0 3px; color: #721c24;">■ 50%未満（要対応）</span>
            </div>
            <div>
                <strong>📅 決算月の表示:</strong> 
                <span style="border-right: 4px solid #dc3545; padding: 2px 6px; margin: 0 3px; background-color: rgba(220, 53, 69, 0.1);">■ 決算月（右端赤線＋📅マーク）</span>
                <span style="border-top: 3px solid #17a2b8; border-bottom: 3px solid #17a2b8; padding: 2px 6px; margin: 0 3px;">■ 会計年度期間（上下青線）</span>
            </div>
        </div>`;
    }

    calculateStatusComposition(tasks) {
        let completedTasks = 0;
        let inProgressTasks = 0;
        let delayedTasks = 0;
        
        tasks.forEach(monthlyTask => {
            if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                const tasksList = Object.values(monthlyTask.tasks);
                const completedCount = tasksList.filter(status => status === true || status === '完了').length;
                const totalCount = tasksList.length;
                
                // ステータスの判定ロジック
                const isDelayedMonth = monthlyTask.status === '遅延' || monthlyTask.status === '停滞';
                const isNoProgress = completedCount === 0 && totalCount > 0; // 0/5のような場合
                const isFullyCompleted = completedCount === totalCount && totalCount > 0;
                
                tasksList.forEach(taskStatus => {
                    if (isDelayedMonth || isNoProgress) {
                        // 遅延・停滞月のタスク または 0/X進捗のタスクは遅延扱い
                        delayedTasks++;
                    } else if (isFullyCompleted) {
                        // 完全に完了した月のタスクは完了扱い
                        completedTasks++;
                    } else if (taskStatus === true || taskStatus === '完了') {
                        // 部分完了月の完了タスク
                        completedTasks++;
                    } else {
                        // 部分完了月の未完了タスク
                        inProgressTasks++;
                    }
                });
            }
        });
        
        const total = completedTasks + inProgressTasks + delayedTasks;
        
        return {
            completed: completedTasks,
            inProgress: inProgressTasks,
            delayed: delayedTasks,
            total,
            completedPercentage: total > 0 ? Math.round((completedTasks / total) * 100) : 0,
            inProgressPercentage: total > 0 ? Math.round((inProgressTasks / total) * 100) : 0,
            delayedPercentage: total > 0 ? Math.round((delayedTasks / total) * 100) : 0
        };
    }

    drawStatusChart(statusData) {
        const canvas = document.getElementById('status-chart');
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;

        // キャンバスをクリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (statusData.total === 0) {
            // データがない場合の表示
            ctx.fillStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('データなし', centerX, centerY);
            
            document.getElementById('chart-legend').innerHTML = '<div style="color: #999;">データがありません</div>';
            return;
        }

        // 色設定
        const colors = {
            completed: '#28a745',    // 緑
            inProgress: '#ffc107',   // 黄
            delayed: '#dc3545'       // 赤
        };

        // 角度計算
        const data = [
            { label: '完了', count: statusData.completed, percentage: statusData.completedPercentage, color: colors.completed },
            { label: '進行中', count: statusData.inProgress, percentage: statusData.inProgressPercentage, color: colors.inProgress },
            { label: '遅延・停滞', count: statusData.delayed, percentage: statusData.delayedPercentage, color: colors.delayed }
        ];

        let currentAngle = -Math.PI / 2; // 12時の位置から開始

        // 円グラフ描画
        data.forEach(segment => {
            if (segment.count > 0) {
                const sliceAngle = (segment.count / statusData.total) * 2 * Math.PI;
                
                ctx.fillStyle = segment.color;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                ctx.closePath();
                ctx.fill();

                // 境界線
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                currentAngle += sliceAngle;
            }
        });

        // 凡例作成（縦並び）
        const legend = data.map(segment => 
            `<div style="display: flex; align-items: center; margin-bottom: 6px; line-height: 1.4;">
                <span style="display: inline-block; width: 12px; height: 12px; background: ${segment.color}; margin-right: 8px; border-radius: 2px; flex-shrink: 0;"></span>
                <span style="font-size: 11px;"><strong>${segment.label}:</strong><br>${segment.count}件 (${segment.percentage}%)</span>
            </div>`
        ).join('');

        document.getElementById('chart-legend').innerHTML = legend;

        // 担当者フィルター情報を追加
        const staffFilter = this.currentFilters.staffId;
        if (staffFilter && staffFilter !== '') {
            const selectedStaff = this.staffs.find(s => s.id == staffFilter);
            if (selectedStaff) {
                document.getElementById('chart-legend').innerHTML += 
                    `<div style="margin-top: 8px; font-size: 11px; color: #666;">担当者: ${selectedStaff.name}</div>`;
            }
        }
    }

    displayAttentionClients(attentionClients) {
        const attentionList = document.getElementById('attention-clients-list');
        const maxInitialDisplay = 10;
        
        // 初期表示（最大10件）
        const initialClients = attentionClients.slice(0, maxInitialDisplay);
        const remainingClients = attentionClients.slice(maxInitialDisplay);
        
        let listHTML = initialClients
            .map(client => `<li>${client.name} (${client.reason}: ${client.progressRate}%)</li>`)
            .join('');
        
        // 10件以上ある場合は「全て表示」ボタンを追加
        if (remainingClients.length > 0) {
            const allClientsHTML = attentionClients
                .map(client => `<li>${client.name} (${client.reason}: ${client.progressRate}%)</li>`)
                .join('');
            
            listHTML += `
                <li style="margin-top: 10px; text-align: center;">
                    <button onclick="analytics.showAllAttentionClients('${encodeURIComponent(allClientsHTML)}')" 
                            style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        残り${remainingClients.length}件を表示 (全${attentionClients.length}件)
                    </button>
                </li>`;
        }
        
        attentionList.innerHTML = listHTML;
    }

    showAllAttentionClients(encodedHTML) {
        const attentionList = document.getElementById('attention-clients-list');
        const allClientsHTML = decodeURIComponent(encodedHTML);
        
        attentionList.innerHTML = allClientsHTML + `
            <li style="margin-top: 10px; text-align: center;">
                <button onclick="analytics.hideExtraAttentionClients()" 
                        style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    最初の10件のみ表示
                </button>
            </li>`;
    }

    hideExtraAttentionClients() {
        // 最新のデータで再表示
        if (this.lastAnalysisData && this.lastAnalysisData.summary.attentionClients) {
            this.displayAttentionClients(this.lastAnalysisData.summary.attentionClients);
        }
    }

    getFilterInfo() {
        const filterInfo = [];
        
        // 担当者フィルター
        if (this.currentFilters.staffId) {
            const selectedStaff = this.staffs.find(s => s.id == this.currentFilters.staffId);
            if (selectedStaff) {
                filterInfo.push(`担当者: ${selectedStaff.name}`);
            }
        }
        
        // 決算月フィルター
        if (this.currentFilters.fiscalMonth) {
            filterInfo.push(`決算月: ${this.currentFilters.fiscalMonth}月`);
        }
        
        // 事業者名フィルター
        if (this.currentFilters.businessName && this.currentFilters.businessName.trim() !== '') {
            filterInfo.push(`事業者名: "${this.currentFilters.businessName.trim()}"`);
        }
        
        return filterInfo;
    }

    getSortedMatrix() {
        if (!this.lastAnalysisData || !this.lastAnalysisData.matrix) {
            return [];
        }

        let matrix = [...this.lastAnalysisData.matrix];

        // 現在のソート状態が設定されている場合、そのソートを適用
        if (this.currentSort) {
            matrix = this.applySortToMatrix(matrix);
        }

        return matrix;
    }

    applySortToMatrix(matrix) {
        return matrix.sort((a, b) => {
            let aValue, bValue;
            
            // 月別ソートの場合
            if (this.currentSort && this.currentSort.startsWith('month-')) {
                const monthKey = this.currentSort.replace('month-', '');
                const aData = a.monthlyProgress[monthKey] || { rate: -1 };
                const bData = b.monthlyProgress[monthKey] || { rate: -1 };
                const result = aData.rate - bData.rate;
                return this.sortDirection === 'asc' ? result : -result;
            }
            
            // 基本ソートの場合
            switch (this.currentSort) {
                case 'id':
                    aValue = parseInt(a.clientId) || 0;
                    bValue = parseInt(b.clientId) || 0;
                    break;
                case 'name':
                    aValue = a.clientName;
                    bValue = b.clientName;
                    break;
                case 'progress':
                    aValue = a.progressRate;
                    bValue = b.progressRate;
                    break;
                case 'staff':
                    aValue = a.staffName || '';
                    bValue = b.staffName || '';
                    break;
                case 'fiscal':
                    // 決算月の場合は現在の月-2ヶ月を起点としたカスタムソート
                    return this.sortByFiscalMonth(a, b);
                case 'accounting':
                    aValue = a.accountingMethod || '';
                    bValue = b.accountingMethod || '';
                    break;
                default:
                    return 0;
            }
            
            // 文字列の場合
            if (typeof aValue === 'string') {
                const result = aValue.localeCompare(bValue, 'ja');
                return this.sortDirection === 'asc' ? result : -result;
            }
            
            // 数値の場合
            const result = aValue - bValue;
            return this.sortDirection === 'asc' ? result : -result;
        });
    }

    sortByFiscalMonth(a, b) {
        const currentMonth = new Date().getMonth() + 1; // 0-11 -> 1-12
        const sortStartMonth = (currentMonth - 2 + 12) % 12 || 12; // 現在の月-2ヶ月を起点 (1-12)

        let aMonth = parseInt(a.fiscalMonth);
        let bMonth = parseInt(b.fiscalMonth);

        // null や undefined の場合はソートの最後に持ってくる
        if (!aMonth || isNaN(aMonth)) return 1;
        if (!bMonth || isNaN(bMonth)) return -1;

        // 起点からの距離を計算
        let aDistance = (aMonth - sortStartMonth + 12) % 12;
        let bDistance = (bMonth - sortStartMonth + 12) % 12;

        // 決算月が同じ場合は進捗率でソート
        if (aDistance === bDistance) {
            const result = b.progressRate - a.progressRate; // 進捗率の高い順
            return this.sortDirection === 'asc' ? -result : result;
        }

        const result = aDistance - bDistance;
        return this.sortDirection === 'asc' ? result : -result;
    }

    applyDefaultFiscalSort() {
        if (!this.lastAnalysisData || !this.lastAnalysisData.matrix) {
            return;
        }

        // デフォルト決算月ソートを設定
        this.currentSort = 'fiscal';
        this.sortDirection = 'asc';
        
        // ソート適用（元データは変更せず、ソート済みデータのみ表示用として生成）
        const sortedMatrix = this.applySortToMatrix([...this.lastAnalysisData.matrix]);
        
        // 表示更新
        this.displayProgressMatrix(sortedMatrix);
        
        // ソートアイコン更新
        this.updateSortIcons('fiscal');
        
        // ソート状態をローカルストレージに保存（元データは生データのまま保持）
        this.saveAnalysisToLocalStorage(this.lastAnalysisData, this.currentFilters);
        
    }

    getSortInfo() {
        if (!this.currentSort) {
            return '';
        }

        const sortNames = {
            'id': '事業者ID',
            'name': '事業者名',
            'progress': '進捗率',
            'staff': '担当者',
            'fiscal': '決算月',
            'accounting': '経理方式'
        };

        // 月別ソートの場合
        if (this.currentSort.startsWith('month-')) {
            const monthKey = this.currentSort.replace('month-', '');
            const [year, month] = monthKey.split('-');
            return `${year}年${month}月の進捗率で${this.sortDirection === 'asc' ? '昇順' : '降順'}`;
        }

        // 基本ソートの場合
        const sortName = sortNames[this.currentSort];
        if (sortName) {
            return `${sortName}で${this.sortDirection === 'asc' ? '昇順' : '降順'}`;
        }

        return '';
    }

    // === 週次進捗グラフ機能 ===



    async checkExistingWeeklyData() {
        try {
            // 最新のスナップショットがあるかチェック
            const latestSnapshot = await SupabaseAPI.getLatestWeeklySnapshot();

            if (latestSnapshot) {
                document.getElementById('weekly-latest-snapshot').textContent =
                    new Date(latestSnapshot).toLocaleDateString('ja-JP');

                // グラフデータを読み込み
                await this.loadWeeklyChartData();
            } else {
                // データがない状態を表示
                this.showNoWeeklyData();
            }

        } catch (error) {
            console.error('週次データチェックエラー:', error);
            this.showNoWeeklyData();
        }
    }

    async saveWeeklySnapshot() {
        const saveBtn = document.getElementById('save-snapshot-btn');
        const originalText = saveBtn.textContent;

        try {
            saveBtn.textContent = '📊 保存中...';
            saveBtn.disabled = true;

            // 現在のフィルター条件を週次スナップショットに適用
            const filters = this.buildWeeklyFilters();
            const result = await SupabaseAPI.saveWeeklySnapshot(null, filters);

            if (result.success) {
                showToast(
                    `週次スナップショットを保存しました (${result.saved_count}件)`,
                    'success',
                    5000
                );

                // UI更新
                document.getElementById('weekly-latest-snapshot').textContent =
                    new Date(result.week_date).toLocaleDateString('ja-JP');

                // グラフデータを再読み込み
                await this.loadWeeklyChartData();

            } else {
                throw new Error(result.message || 'スナップショットの保存に失敗しました');
            }

        } catch (error) {
            console.error('スナップショット保存エラー:', error);
            showToast(`スナップショット保存に失敗: ${error.message}`, 'error');

        } finally {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }

    async loadWeeklyChartData() {
        try {
            // 現在のフィルターを適用して週次データを取得
            const filters = this.buildWeeklyFilters();
            const weeklyData = await SupabaseAPI.getWeeklyTrends(filters);

            if (weeklyData && weeklyData.length > 0) {
                this.weeklyChartData = weeklyData;
                this.updateWeeklyInfoDisplay(weeklyData);

                // 初期状態ではグラフは非表示
                document.getElementById('no-weekly-data').style.display = 'none';

            } else {
                this.showNoWeeklyData();
            }

        } catch (error) {
            console.error('週次データ読み込みエラー:', error);
            this.showNoWeeklyData();
        }
    }

    buildWeeklyFilters() {
        const filters = {};

        // 【修正】全体ダッシュボードと同じ期間フィルターを使用
        // 現在選択されている期間を取得
        const startPeriod = this.currentFilters.startPeriod;
        const endPeriod = this.currentFilters.endPeriod;

        console.log('📊 週次フィルター:', {
            startPeriod,
            endPeriod,
            currentFilters: this.currentFilters
        });

        if (startPeriod && endPeriod) {
            // 期間が選択されている場合はそれを使用（月次データ用）
            filters.startPeriod = startPeriod;  // YYYY-MM形式で直接保存
            filters.endPeriod = endPeriod;      // YYYY-MM形式で直接保存

            // ログ用のdate情報も保持
            const startDate = new Date(startPeriod + '-01');
            const endDate = new Date(endPeriod + '-01');
            endDate.setMonth(endDate.getMonth() + 1, 0); // その月の最終日

            filters.startDate = startDate.toISOString().split('T')[0];
            filters.endDate = endDate.toISOString().split('T')[0];

            console.log('📅 計算された期間:', {
                startDate: filters.startDate,
                endDate: filters.endDate
            });
        } else {
            // フォールバック: 過去3ヶ月
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(endDate.getMonth() - 3);

            filters.startDate = startDate.toISOString().split('T')[0];
            filters.endDate = endDate.toISOString().split('T')[0];

            console.log('⚠️ フォールバック期間使用:', {
                startDate: filters.startDate,
                endDate: filters.endDate
            });
        }

        // 他のフィルターも適用
        if (this.currentFilters.staffId) {
            filters.staffId = this.currentFilters.staffId;
        }
        if (this.currentFilters.fiscalMonth) {
            filters.fiscalMonth = parseInt(this.currentFilters.fiscalMonth);
        }
        if (this.currentFilters.businessName) {
            filters.clientName = this.currentFilters.businessName;
        }

        return filters;
    }

    updateWeeklyInfoDisplay(weeklyData) {
        // データポイント数
        document.getElementById('weekly-data-points').textContent = `${weeklyData.length}週`;

        // 前週比計算
        if (weeklyData.length >= 2) {
            const latest = weeklyData[weeklyData.length - 1];
            const change = latest.week_over_week_change;

            if (change !== null) {
                const symbol = change > 0 ? '▲' : change < 0 ? '▼' : '→';
                const color = change > 0 ? '#28a745' : change < 0 ? '#dc3545' : '#6c757d';

                document.getElementById('weekly-trend-value').innerHTML =
                    `<span style="color: ${color}">${symbol} ${Math.abs(change).toFixed(1)}%</span>`;
            } else {
                document.getElementById('weekly-trend-value').textContent = '--';
            }
        } else {
            document.getElementById('weekly-trend-value').textContent = '--';
        }

        // 最新記録日と詳細情報
        if (weeklyData.length > 0) {
            const latest = weeklyData[weeklyData.length - 1];
            const latestCompletedTasks = latest.snapshots.reduce((sum, s) => sum + s.completed_tasks, 0);
            const latestTotalTasks = latest.snapshots.reduce((sum, s) => sum + s.total_tasks, 0);

            document.getElementById('weekly-latest-snapshot').innerHTML =
                `${new Date(latest.week_date).toLocaleDateString('ja-JP')}<br>` +
                `<small style="color: #6c757d;">(${latestCompletedTasks}/${latestTotalTasks}タスク)</small>`;
        }
    }

    async toggleWeeklyChart() {
        const toggleBtn = document.getElementById('toggle-chart-btn');
        const chartArea = document.getElementById('weekly-chart-area');
        const infoArea = document.getElementById('weekly-progress-info');

        if (chartArea.style.display === 'none' || !chartArea.style.display) {
            // グラフを表示
            if (!this.weeklyChartData || this.weeklyChartData.length === 0) {
                showToast('表示する週次データがありません', 'warning');
                return;
            }

            await this.showWeeklyChart();
            toggleBtn.textContent = '📈 グラフを隠す';

        } else {
            // グラフを非表示
            chartArea.style.display = 'none';
            infoArea.style.display = 'none';
            toggleBtn.textContent = '📈 グラフを表示';
        }
    }

    async showWeeklyChart() {
        try {
            const chartArea = document.getElementById('weekly-chart-area');
            const infoArea = document.getElementById('weekly-progress-info');

            chartArea.style.display = 'block';
            infoArea.style.display = 'block';

            // Chart.jsでグラフ作成
            await this.createWeeklyChart();

        } catch (error) {
            console.error('週次グラフ表示エラー:', error);
            showToast('グラフの表示に失敗しました', 'error');
        }
    }

    async createWeeklyChart() {
        const canvas = document.getElementById('weeklyProgressChart');
        const ctx = canvas.getContext('2d');

        // 既存のチャートを破棄
        if (this.weeklyChartInstance) {
            this.weeklyChartInstance.destroy();
        }

        // データ準備
        const labels = this.weeklyChartData.map(trend => {
            const date = new Date(trend.week_date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });

        const avgProgressData = this.weeklyChartData.map(trend => trend.average_progress);
        // 【修正】要注意クライアント数データに変更
        const attentionData = this.weeklyChartData.map(trend => trend.low_progress_count || 0);

        // タスク完了数データの追加
        const totalCompletedTasks = this.weeklyChartData.map(trend => {
            return trend.snapshots.reduce((sum, snapshot) => sum + snapshot.completed_tasks, 0);
        });
        const totalTasks = this.weeklyChartData.map(trend => {
            return trend.snapshots.reduce((sum, snapshot) => sum + snapshot.total_tasks, 0);
        });

        // Chart.js設定
        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '平均進捗率 (%)',
                        data: avgProgressData,
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '完了タスク数',
                        type: 'bar',
                        data: totalCompletedTasks,
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.7)',
                        yAxisID: 'y1',
                        borderWidth: 1
                    },
                    {
                        label: '要注意クライアント数',
                        data: attentionData,
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        yAxisID: 'y2',
                        tension: 0.4,
                        borderDash: [2, 2],
                        pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: '週 (月曜日基準)'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: '平均進捗率 (%)'
                        },
                        max: 100,
                        min: 50
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '完了タスク数',
                            color: '#28a745'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            color: '#28a745'
                        },
                        // 完了タスク数の縦軸をMAXの50%を最低値に設定
                        suggestedMin: (() => {
                            const completedTasks = this.weeklyChartData.map(d => d.total_completed_tasks || 0);
                            const max = Math.max(...completedTasks);
                            return Math.floor(max * 0.5);
                        })()
                    },
                    y2: {
                        type: 'linear',
                        display: false,  // 3軸目は非表示（ツールチップで確認）
                        position: 'right',
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: '週次進捗推移'
                    },
                    tooltip: {
                        callbacks: {
                            afterLabel: (context) => {
                                const weekData = this.weeklyChartData[context.dataIndex];
                                const datasetLabel = context.dataset.label;

                                // 各グラフライン固有の情報のみ表示（重複除去）
                                if (datasetLabel === '平均進捗率 (%)') {
                                    const completedTasks = weekData.total_completed_tasks || weekData.snapshots.reduce((sum, s) => sum + s.completed_tasks, 0);
                                    const totalTasks = weekData.total_all_tasks || weekData.snapshots.reduce((sum, s) => sum + s.total_tasks, 0);
                                    return [
                                        `完了: ${completedTasks} / ${totalTasks}`,
                                        `平均進捗率: ${weekData.average_progress}%`
                                    ];
                                }
                                else if (datasetLabel === '完了タスク数') {
                                    const completedTasks = weekData.total_completed_tasks || weekData.snapshots.reduce((sum, s) => sum + s.completed_tasks, 0);
                                    return [
                                        `完了タスク: ${completedTasks}件`,
                                        `前週比: ${weekData.week_over_week_change ?
                                            (weekData.week_over_week_change > 0 ? '+' : '') +
                                            weekData.week_over_week_change.toFixed(1) + '%' : 'N/A'}`
                                    ];
                                }
                                else if (datasetLabel === '要注意クライアント数') {
                                    const attentionCount = weekData.low_progress_count || 0;
                                    const totalClients = weekData.total_clients || 0;
                                    const attentionRate = totalClients > 0 ? ((attentionCount / totalClients) * 100).toFixed(1) : 0;

                                    return [
                                        `要注意: ${attentionCount} / ${totalClients}件`,
                                        `比率: ${attentionRate}%`,
                                        `(進捗50%未満のクライアント)`
                                    ];
                                }

                                return [];
                            }
                        }
                    }
                }
            }
        };

        // チャート作成
        this.weeklyChartInstance = new Chart(ctx, config);
    }

    async updateWeeklyChart() {
        if (!this.weeklyChartInstance) return;

        try {
            // 新しいデータでチャートを更新
            await this.loadWeeklyChartData();

            if (this.weeklyChartData && this.weeklyChartData.length > 0) {
                await this.createWeeklyChart();
            }

        } catch (error) {
            console.error('週次グラフ更新エラー:', error);
        }
    }

    showNoWeeklyData() {
        document.getElementById('no-weekly-data').style.display = 'block';
        document.getElementById('weekly-chart-area').style.display = 'none';
        document.getElementById('weekly-progress-info').style.display = 'none';

        const toggleBtn = document.getElementById('toggle-chart-btn');
        if (toggleBtn) {
            toggleBtn.textContent = '📈 グラフを表示';
        }

        // 情報をクリア
        document.getElementById('weekly-data-points').textContent = '--';
        document.getElementById('weekly-trend-value').textContent = '--';
    }

    // ========================================
    // コンパクト版週次グラフ機能 （ダッシュボード統合版）
    // ========================================

    async initializeCompactWeeklyChart() {
        try {
            // 初期データ読み込み
            await this.loadWeeklyChartData();

            if (this.weeklyChartData && this.weeklyChartData.length > 0) {
                // グラフ作成
                await this.createCompactWeeklyChart();
                this.showCompactWeeklyData();

                // 前週比情報を更新
                this.updateWeeklyTrendInfo();

            } else {
                this.showNoCompactWeeklyData();
            }

        } catch (error) {
            console.error('コンパクト版週次グラフ初期化エラー:', error);
            this.showNoCompactWeeklyData();
        }
    }

    async createCompactWeeklyChart() {
        const canvas = document.getElementById('weeklyProgressChartCompact');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // 既存のチャートを破棄
        if (this.compactWeeklyChartInstance) {
            this.compactWeeklyChartInstance.destroy();
        }

        // データ準備
        const labels = this.weeklyChartData.map(trend => {
            const date = new Date(trend.week_date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });

        const avgProgressData = this.weeklyChartData.map(trend => trend.average_progress);
        const attentionData = this.weeklyChartData.map(trend => trend.low_progress_count || 0);

        // タスク完了数データ
        const totalCompletedTasks = this.weeklyChartData.map(trend => {
            return trend.snapshots.reduce((sum, snapshot) => sum + snapshot.completed_tasks, 0);
        });

        // Chart.js設定（複合グラフ：折れ線×2 + 棒グラフ×1）
        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '進捗率',
                        data: avgProgressData,
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        yAxisID: 'y',
                        tension: 0.3,
                        type: 'line',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        borderWidth: 2
                    },
                    {
                        label: '完了タスク数',
                        data: totalCompletedTasks,
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.7)',
                        yAxisID: 'y1',
                        type: 'bar',
                        borderWidth: 1,
                        barThickness: 15
                    },
                    {
                        label: '要注意クライアント',
                        data: attentionData,
                        backgroundColor: 'rgba(220, 53, 69, 0.7)',
                        borderColor: '#dc3545',
                        yAxisID: 'y2',
                        type: 'bar',
                        borderWidth: 1,
                        barThickness: 20
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 0,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 12 },
                        bodyFont: { size: 11 },
                        callbacks: {
                            title: (context) => {
                                const weekData = this.weeklyChartData[context[0].dataIndex];
                                const date = new Date(weekData.week_date);
                                return `週 ${date.getMonth() + 1}/${date.getDate()} (${weekData.snapshots.length}事業者)`;
                            },
                            afterLabel: (context) => {
                                const weekData = this.weeklyChartData[context.dataIndex];
                                const datasetLabel = context.dataset.label;

                                // 各グラフライン固有の情報のみ表示（重複除去）
                                if (datasetLabel === '平均進捗率 (%)') {
                                    const completedTasks = weekData.total_completed_tasks || weekData.snapshots.reduce((sum, s) => sum + s.completed_tasks, 0);
                                    const totalTasks = weekData.total_all_tasks || weekData.snapshots.reduce((sum, s) => sum + s.total_tasks, 0);
                                    return [
                                        `完了: ${completedTasks} / ${totalTasks}`,
                                        `平均進捗率: ${weekData.average_progress}%`
                                    ];
                                }
                                else if (datasetLabel === '完了タスク数') {
                                    const completedTasks = weekData.total_completed_tasks || weekData.snapshots.reduce((sum, s) => sum + s.completed_tasks, 0);
                                    return [
                                        `完了タスク: ${completedTasks}件`,
                                        `前週比: ${weekData.week_over_week_change ?
                                            (weekData.week_over_week_change > 0 ? '+' : '') +
                                            weekData.week_over_week_change.toFixed(1) + '%' : 'N/A'}`
                                    ];
                                }
                                else if (datasetLabel === '要注意クライアント') {
                                    const attentionCount = weekData.low_progress_count || 0;
                                    const totalClients = weekData.total_clients || 0;
                                    const attentionRate = totalClients > 0 ? ((attentionCount / totalClients) * 100).toFixed(1) : 0;

                                    return [
                                        `要注意: ${attentionCount} / ${totalClients}件`,
                                        `比率: ${attentionRate}%`,
                                        `(進捗50%未満のクライアント)`
                                    ];
                                }

                                return [];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 10
                            }
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: '進捗率 (%)',
                            font: { size: 10 },
                            color: '#28a745'
                        },
                        max: 100,
                        min: 50,
                        ticks: {
                            font: { size: 9 },
                            color: '#28a745'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '完了タスク数',
                            font: { size: 10 },
                            color: '#007bff'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            font: { size: 9 },
                            color: '#007bff'
                        },
                        // 完了タスク数の縦軸をタスク総数に設定
                        max: (() => {
                            const totalTasks = this.weeklyChartData.map(d => d.total_all_tasks || 0);
                            return Math.max(...totalTasks);
                        })(),
                        suggestedMin: (() => {
                            const completedTasks = this.weeklyChartData.map(d => d.total_completed_tasks || 0);
                            const max = Math.max(...completedTasks);
                            return Math.floor(max * 0.5);
                        })()
                    },
                    y2: {
                        type: 'linear',
                        display: false, // 3軸目は非表示（ツールチップで確認）
                        position: 'right',
                        min: 0,
                        max: 50,
                        beginAtZero: true
                    }
                }
            }
        };

        this.compactWeeklyChartInstance = new Chart(ctx, config);
    }

    updateWeeklyTrendInfo() {
        if (!this.weeklyChartData || this.weeklyChartData.length < 2) {
            document.getElementById('weekly-trend-info').style.display = 'none';
            return;
        }

        // 前週比計算
        const latest = this.weeklyChartData[this.weeklyChartData.length - 1];
        const previous = this.weeklyChartData[this.weeklyChartData.length - 2];
        const diff = latest.average_progress - previous.average_progress;

        const trendElement = document.getElementById('weekly-trend-value');
        if (trendElement) {
            const symbol = diff > 0 ? '+' : '';
            const color = diff > 0 ? '#28a745' : diff < 0 ? '#dc3545' : '#6c757d';
            trendElement.textContent = `${symbol}${diff.toFixed(1)}%`;
            trendElement.style.color = color;
        }

        document.getElementById('weekly-trend-info').style.display = 'block';
    }

    showCompactWeeklyData() {
        document.getElementById('no-weekly-data-compact').style.display = 'none';
        document.getElementById('weekly-chart-area-compact').style.display = 'block';
    }

    showNoCompactWeeklyData() {
        document.getElementById('no-weekly-data-compact').style.display = 'flex';
        document.getElementById('weekly-chart-area-compact').style.display = 'none';
        document.getElementById('weekly-trend-info').style.display = 'none';
    }

    async updateCompactWeeklyChart() {
        try {
            await this.loadWeeklyChartData();

            if (this.weeklyChartData && this.weeklyChartData.length > 0) {
                await this.createCompactWeeklyChart();
                this.showCompactWeeklyData();
                this.updateWeeklyTrendInfo();
            } else {
                this.showNoCompactWeeklyData();
            }

        } catch (error) {
            console.error('コンパクト版週次グラフ更新エラー:', error);
            this.showNoCompactWeeklyData();
        }
    }

    // スマートダッシュボード表示制御
    setupDashboardToggle() {
        const toggleButton = document.getElementById('toggle-dashboard-button');
        const dashboardSection = document.getElementById('summary-dashboard');

        if (!toggleButton || !dashboardSection) {
            console.log('Dashboard toggle elements not found, setting up observer...');
            this.observeDashboardElements();
            return;
        }

        this.initializeDashboardToggle(toggleButton, dashboardSection);
    }

    // DOM要素の出現を監視（動的な要素生成に対応）
    observeDashboardElements() {
        if (this.dashboardObserver) {
            this.dashboardObserver.disconnect();
        }

        this.dashboardObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    const toggleButton = document.getElementById('toggle-dashboard-button');
                    const dashboardSection = document.getElementById('summary-dashboard');

                    if (toggleButton && dashboardSection) {
                        this.initializeDashboardToggle(toggleButton, dashboardSection);
                        this.dashboardObserver.disconnect();
                        break;
                    }
                }
            }
        });

        this.dashboardObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ダッシュボード表示制御の初期化
    initializeDashboardToggle(toggleButton, dashboardSection) {
        // ユーザー固有のローカルストレージキー
        const getCurrentUser = () => {
            try {
                const userStr = localStorage.getItem('currentUser');
                return userStr ? JSON.parse(userStr) : null;
            } catch (e) {
                return null;
            }
        };

        const currentUser = getCurrentUser();
        const storageKey = currentUser ? `dashboard-visible-${currentUser.id}` : 'dashboard-visible-guest';

        // 保存された状態を読み込み（デフォルトは表示）
        const savedState = localStorage.getItem(storageKey);
        this.dashboardVisible = savedState !== 'false';

        // CSS クラスベースでの制御
        this.updateDashboardVisibility(dashboardSection, toggleButton);

        // クリックイベントリスナー
        toggleButton.addEventListener('click', () => {
            this.dashboardVisible = !this.dashboardVisible;
            localStorage.setItem(storageKey, this.dashboardVisible.toString());
            this.updateDashboardVisibility(dashboardSection, toggleButton);
        });

        // フィルター変更時の状態保持
        this.preserveDashboardState = () => {
            setTimeout(() => {
                this.updateDashboardVisibility(dashboardSection, toggleButton);
            }, 100);
        };

        // MutationObserverでダッシュボードの再表示を監視
        const dashboardObserver = new MutationObserver(() => {
            if (dashboardSection.style.display === 'block' && !this.dashboardVisible) {
                this.updateDashboardVisibility(dashboardSection, toggleButton);
            }
        });

        dashboardObserver.observe(dashboardSection, {
            attributes: true,
            attributeFilter: ['style']
        });

        console.log('✅ スマートダッシュボード制御を初期化しました');
    }

    // ダッシュボードの表示状態を更新
    updateDashboardVisibility(dashboardSection, toggleButton) {
        if (this.dashboardVisible) {
            // 表示
            dashboardSection.classList.remove('dashboard-hidden');
            dashboardSection.style.display = 'block';
            toggleButton.innerHTML = '📊 グラフ非表示';
            toggleButton.className = 'dashboard-toggle-btn';
        } else {
            // 非表示
            dashboardSection.classList.add('dashboard-hidden');
            toggleButton.innerHTML = '📊 グラフ表示';
            toggleButton.className = 'dashboard-toggle-btn hidden-state';
        }
    }

    // マイタスク状況を取得・表示
    async updateMyTaskStatus() {
        const selectedStaffId = sessionStorage.getItem('selected-staff-id');
        const selectedStaffName = sessionStorage.getItem('selected-staff-name');

        console.log('📊 マイタスク状況更新:', { selectedStaffId, selectedStaffName });

        // sessionStorageに担当者情報がない場合は非表示
        if (!selectedStaffId || !selectedStaffName) {
            console.log('⚠️ sessionStorageに担当者情報がないため非表示');
            const statusCard = document.getElementById('my-task-status-card');
            if (statusCard) {
                statusCard.style.display = 'none';
            }
            return;
        }

        try {
            // tasksテーブルからタスクを取得（supabaseクライアント直接使用）
            const { data: tasks, error } = await supabase
                .from('tasks')
                .select('*')
                .in('status', ['依頼中', '作業完了']);

            if (error) {
                console.error('❌ タスク取得エラー:', error);
                return;
            }

            if (!tasks) {
                console.error('❌ タスク取得に失敗しました（データがnull）');
                return;
            }

            console.log('✅ タスク取得成功:', tasks.length, '件');

            // 受任中で「依頼中」ステータスのタスク数
            const pendingCount = tasks.filter(task =>
                task.assignee_id === parseInt(selectedStaffId) &&
                task.status === '依頼中'
            ).length;

            // 依頼したタスクで「作業完了」（確認待ち）のタスク数
            const waitingCount = tasks.filter(task =>
                task.requester_id === parseInt(selectedStaffId) &&
                task.status === '作業完了'
            ).length;

            console.log('📊 タスク数:', { pendingCount, waitingCount });

            // カードを表示・更新
            const statusCard = document.getElementById('my-task-status-card');
            const pendingCountEl = document.getElementById('pending-task-count');
            const waitingCountEl = document.getElementById('waiting-task-count');
            const pendingCard = document.getElementById('pending-task-card');
            const waitingCard = document.getElementById('waiting-task-card');

            console.log('🎨 DOM要素:', {
                statusCard: !!statusCard,
                pendingCountEl: !!pendingCountEl,
                waitingCountEl: !!waitingCountEl
            });

            if (statusCard && pendingCountEl && waitingCountEl) {
                // ログインユーザー情報を表示
                const loginUserNameEl = document.getElementById('login-user-name');
                const loginUserEmailEl = document.getElementById('login-user-email');
                const selectedStaffEmail = sessionStorage.getItem('selected-staff-email');

                if (loginUserNameEl && selectedStaffName) {
                    loginUserNameEl.textContent = selectedStaffName;
                }
                if (loginUserEmailEl && selectedStaffEmail) {
                    loginUserEmailEl.textContent = `(${selectedStaffEmail})`;
                }

                statusCard.style.display = 'block';
                pendingCountEl.textContent = `${pendingCount}件`;
                waitingCountEl.textContent = `${waitingCount}件`;

                console.log('✅ カードを表示しました');

                // ホバー効果を追加
                if (pendingCard) {
                    pendingCard.onmouseover = function() {
                        this.style.transform = 'translateY(-2px)';
                        this.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
                    };
                    pendingCard.onmouseout = function() {
                        this.style.transform = '';
                        this.style.boxShadow = '';
                    };
                    // クリックでタスク管理画面へ遷移
                    pendingCard.onclick = () => {
                        window.location.href = 'task-management/pages/task-management.html';
                    };
                }

                if (waitingCard) {
                    waitingCard.onmouseover = function() {
                        this.style.transform = 'translateY(-2px)';
                        this.style.boxShadow = '0 4px 12px rgba(25, 118, 210, 0.3)';
                    };
                    waitingCard.onmouseout = function() {
                        this.style.transform = '';
                        this.style.boxShadow = '';
                    };
                    // クリックでタスク管理画面へ遷移
                    waitingCard.onclick = () => {
                        window.location.href = 'task-management/pages/task-management.html';
                    };
                }
            }

        } catch (error) {
            console.error('マイタスク状況の更新に失敗:', error);
        }
    }

    // 進捗マトリクス表のタイトルに担当者名を表示
    updateMatrixStaffLabel() {
        const matrixStaffLabel = document.getElementById('matrix-staff-filter-label');
        if (!matrixStaffLabel) return;

        const staffId = this.currentFilters.staffId;

        if (!staffId || staffId === '') {
            // 全員表示の場合
            matrixStaffLabel.textContent = '（全担当者）';
        } else {
            // 特定担当者でフィルタリングされている場合
            const staff = this.staffs.find(s => s.id === parseInt(staffId));
            if (staff) {
                matrixStaffLabel.textContent = `（検索対象の担当者: ${staff.name}）`;
            } else {
                matrixStaffLabel.textContent = '';
            }
        }
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    window.analytics = new AnalyticsPage();

    // デバッグ用: グローバル登録確認

    try {
        await window.analytics.initialize();

        // 週次グラフ初期化（既存の独立版は統合ダッシュボードに移行のため無効化）
        // await window.analytics.initializeWeeklyChart();

        // コンパクト版週次グラフ初期化（統合ダッシュボード版）
        await window.analytics.initializeCompactWeeklyChart();

    } catch (error) {
        console.error('❌ Analytics initialization error:', error);
        showToast('分析機能の初期化に失敗しました', 'error');

        // 最低限のUIは動作するようにする
        window.analytics.setupEventListeners();
    }

    // URL設定機能（その他のアプリ）
    let appLinks = [];
    let originalAppLinksState = [];
    let currentEditingAppLinks = [];
    let sortableUrlList = null;

    // モーダル要素の取得
    const urlSettingsModal = document.getElementById('url-settings-modal');
    const urlSettingsButton = document.getElementById('url-settings-button');
    const closeUrlSettingsModalButton = urlSettingsModal?.querySelector('.close-button');
    const urlListContainer = document.getElementById('url-list-container');
    const newUrlNameInput = document.getElementById('new-url-name');
    const newUrlLinkInput = document.getElementById('new-url-link');
    const addUrlButton = document.getElementById('add-url-button');
    const saveUrlSettingsButton = document.getElementById('save-url-settings-button');
    const cancelUrlSettingsButton = document.getElementById('cancel-url-settings-button');

    // アコーディオン機能
    function toggleAccordion(header) {
        const content = header.nextElementSibling;
        const icon = header.querySelector('.accordion-icon');

        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.textContent = '▲';
        } else {
            content.style.display = 'none';
            icon.textContent = '▼';
        }
    }

    // イベントリスナーの設定
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAccordion(header);
        });
    });

    // グローバルクリックでアコーディオンを閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.accordion-container')) {
            document.querySelectorAll('.accordion-content').forEach(content => {
                content.style.display = 'none';
            });
            document.querySelectorAll('.accordion-icon').forEach(icon => {
                icon.textContent = '▼';
            });
        }
    });

    // URL設定モーダル関連の機能
    function openUrlSettingsModal() {
        originalAppLinksState = JSON.parse(JSON.stringify(appLinks));
        currentEditingAppLinks = JSON.parse(JSON.stringify(appLinks));
        renderUrlListForEdit();

        if (urlSettingsModal) {
            urlSettingsModal.style.display = 'block';
        }
    }

    function closeUrlSettingsModal() {
        if (sortableUrlList) {
            sortableUrlList.destroy();
            sortableUrlList = null;
        }
        if (urlSettingsModal) {
            urlSettingsModal.style.display = 'none';
        }
    }

    function renderUrlListForEdit() {
        if (!urlListContainer) return;

        urlListContainer.innerHTML = '';
        currentEditingAppLinks.forEach((link, index) => {
            const item = document.createElement('div');
            item.className = 'url-item';
            item.dataset.id = link.id || `new-${index}`;
            item.innerHTML = `
                <span class="drag-handle">☰</span>
                <input type="text" class="url-name-input" value="${link.name || ''}" placeholder="リンク名">
                <input type="url" class="url-link-input" value="${link.url || ''}" placeholder="https://example.com">
                <button class="delete-button">削除</button>
            `;
            urlListContainer.appendChild(item);

            item.querySelector('.delete-button').addEventListener('click', () => {
                const idToDelete = item.dataset.id;
                currentEditingAppLinks = currentEditingAppLinks.filter(l => (l.id || `new-${currentEditingAppLinks.indexOf(l)}`) != idToDelete);
                renderUrlListForEdit();
            });
        });

        if (sortableUrlList) {
            sortableUrlList.destroy();
        }
        sortableUrlList = new Sortable(urlListContainer, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'dragging'
        });
    }

    function addNewUrlItem() {
        const name = newUrlNameInput?.value.trim();
        const url = newUrlLinkInput?.value.trim();

        if (!name || !url) {
            toast.warning('リンク名とURLの両方を入力してください。');
            return;
        }
        try {
            new URL(url);
        } catch (_) {
            toast.error('有効なURLを入力してください。');
            return;
        }

        currentEditingAppLinks.push({ name, url });
        renderUrlListForEdit();
        if (newUrlNameInput) newUrlNameInput.value = '';
        if (newUrlLinkInput) newUrlLinkInput.value = '';
    }

    async function saveUrlSettings() {
        const saveToast = toast.loading('URL設定を保存中...');

        try {
            // DOM順序を取得
            const orderedIds = Array.from(urlListContainer.children).map(item => item.dataset.id);
            const finalLinks = [];

            orderedIds.forEach(id => {
                const item = urlListContainer.querySelector(`[data-id="${id}"]`);
                if (item) {
                    const name = item.querySelector('.url-name-input').value.trim();
                    const url = item.querySelector('.url-link-input').value.trim();

                    if (name && url) {
                        const linkData = { name, url };
                        if (id.startsWith('new-')) {
                            finalLinks.push(linkData);
                        } else {
                            linkData.id = parseInt(id);
                            finalLinks.push(linkData);
                        }
                    }
                }
            });

            // 変更を特定
            const originalIds = new Set(originalAppLinksState.filter(l => l.id).map(l => l.id));
            const finalIds = new Set(finalLinks.filter(l => l.id).map(l => l.id));
            const idsToDelete = [...originalIds].filter(id => !finalIds.has(id));

            const linksToCreate = finalLinks.filter(l => l.id === undefined);
            const linksToUpdate = finalLinks.filter(l => l.id !== undefined);

            // Supabaseに保存
            try {
                const promises = [];
                if (idsToDelete.length > 0) {
                    promises.push(SupabaseAPI.deleteAppLinks(idsToDelete));
                }
                if (linksToCreate.length > 0) {
                    promises.push(SupabaseAPI.createAppLinks(linksToCreate));
                }
                if (linksToUpdate.length > 0) {
                    promises.push(SupabaseAPI.updateAppLinks(linksToUpdate));
                }

                await Promise.all(promises);
            } catch (supabaseError) {
                console.warn('SupabaseAPI error, saving to localStorage as fallback:', supabaseError);
                localStorage.setItem('appLinks', JSON.stringify(finalLinks));
            }

            toast.update(saveToast, 'URL設定を保存しました', 'success');
            closeUrlSettingsModal();
            loadAppLinks();

        } catch (error) {
            console.error('Error saving URL settings:', error);
            toast.update(saveToast, 'URL設定の保存に失敗しました', 'error');
        }
    }

    async function loadAppLinks() {
        try {
            appLinks = await SupabaseAPI.getAppLinks();
            renderAppLinksButtons();
        } catch (error) {
            console.error('Error loading app links from Supabase:', error);
            // エラー時はlocalStorageからフォールバック
            try {
                const stored = localStorage.getItem('appLinks');
                appLinks = stored ? JSON.parse(stored) : [];
                renderAppLinksButtons();
            } catch (fallbackError) {
                console.error('Error loading from localStorage:', fallbackError);
                appLinks = [];
                renderAppLinksButtons();
            }
        }
    }

    function renderAppLinksButtons() {
        const container = document.querySelector('#other-apps-accordion .accordion-buttons-container');
        if (!container) return;

        // 既存の動的ボタンを削除（URL設定ボタンは残す）
        const urlSettingsBtn = container.querySelector('#url-settings-button');
        container.innerHTML = '';
        if (urlSettingsBtn) {
            container.appendChild(urlSettingsBtn);
        }

        // アプリリンクボタンを追加
        appLinks.forEach(link => {
            const button = document.createElement('button');
            button.className = 'accordion-button';
            button.textContent = link.name;
            button.addEventListener('click', () => {
                window.open(link.url, '_blank');
            });
            container.appendChild(button);
        });
    }

    // イベントリスナーの設定
    if (urlSettingsButton) {
        urlSettingsButton.addEventListener('click', openUrlSettingsModal);
    }

    if (closeUrlSettingsModalButton) {
        closeUrlSettingsModalButton.addEventListener('click', closeUrlSettingsModal);
    }

    if (cancelUrlSettingsButton) {
        cancelUrlSettingsButton.addEventListener('click', closeUrlSettingsModal);
    }

    if (saveUrlSettingsButton) {
        saveUrlSettingsButton.addEventListener('click', saveUrlSettings);
    }

    if (addUrlButton) {
        addUrlButton.addEventListener('click', addNewUrlItem);
    }

    // モーダル外クリックで閉じる
    if (urlSettingsModal) {
        urlSettingsModal.addEventListener('click', (e) => {
            if (e.target === urlSettingsModal) {
                closeUrlSettingsModal();
            }
        });
    }

    // アプリリンクを初期化時に読み込み
    loadAppLinks();

    // 設定画面リンクのイベントリスナー
    const settingsLink = document.querySelector('.nav-tab.settings');
    if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            SupabaseAPI.redirectToSettings();
        });
    }
});

