// 分析機能メインスクリプト
import { SupabaseAPI } from './supabase-client.js';
import './toast.js'; // showToastはwindow.showToastとしてグローバルに利用可能

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
    }

    async initialize() {
        console.log('Analytics page initializing...');
        
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
            
            // UI初期化
            this.setupEventListeners();
            this.populateFilters();
            
            // URLパラメータから担当者を自動選択（復元前に処理）
            const hasUrlParameters = this.handleUrlParameters();
            
            // URLパラメータがある場合は復元をスキップして新規分析
            if (hasUrlParameters) {
                // URLパラメータがある場合は新規分析を優先
                console.log('URL parameters detected, skipping localStorage restore');
            } else {
                // URLパラメータがない場合のみ保存された分析結果を復元
                const hasRestoredData = this.restoreAnalysisFromLocalStorage();
                if (!hasRestoredData) {
                    // 初期データで自動集計を実行
                    setTimeout(async () => {
                        await this.performAnalysis();
                    }, 500); // UI初期化完了後に実行
                }
            }
            
            console.log('Analytics page initialized successfully');
            showToast('分析機能を読み込みました', 'success');
            
            // 詳細画面から戻ってきた場合の透明リフレッシュ
            const fromDetails = document.referrer && document.referrer.includes('details.html');
            const sessionFlag = sessionStorage.getItem('returnFromDetails');
            
            if (fromDetails || sessionFlag) {
                console.log('🔄 Detected return from details page, scheduling transparent refresh...');
                console.log('Detection method:', fromDetails ? 'referrer' : 'sessionStorage');
                
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
        console.log('Loading initial data...');
        
        // 並列でデータを取得
        const [clientsResult, staffsResult, tasksResult] = await Promise.all([
            SupabaseAPI.getClients(),
            SupabaseAPI.getStaffs(),
            SupabaseAPI.getMonthlyTasks()
        ]);

        this.clients = clientsResult || [];
        this.staffs = staffsResult || [];
        this.monthlyTasks = tasksResult || [];
        
        console.log(`Loaded: ${this.clients.length} clients, ${this.staffs.length} staffs, ${this.monthlyTasks.length} tasks`);
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
                console.log('🔄 Page became visible, scheduling transparent refresh...');
                this.scheduleTransparentRefresh();
            }
        });

        // ページフォーカス時にも更新（ブラウザタブ切り替えで戻った場合）
        window.addEventListener('focus', () => {
            if (this.lastAnalysisData) {
                console.log('🔄 Page gained focus, scheduling transparent refresh...');
                this.scheduleTransparentRefresh();
            }
        });

        // popstate イベント（戻るボタンで戻った場合）
        window.addEventListener('popstate', () => {
            if (this.lastAnalysisData) {
                console.log('🔄 Browser back detected, scheduling transparent refresh...');
                this.scheduleTransparentRefresh();
            }
        });
        
        console.log('✅ Page visibility listeners set up for transparent auto-refresh');
    }

    scheduleTransparentRefresh() {
        // 既存のタイマーがあればクリア
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        
        // 500ms後に透明な更新を実行（検索と同じデバウンス感覚）
        this.refreshTimeout = setTimeout(async () => {
            console.log('🔄 Transparent data refresh triggered...');
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
                    console.log('✅ Data changes detected and refreshed');
                } else {
                    console.log('ℹ️ Data refresh completed (no changes)');
                }
            } else {
                console.log('ℹ️ Transparent refresh skipped (invalid period settings)');
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
            console.log('🔄 Refreshing analytics data...');
            
            // フィルター条件を保持したままデータを再読み込み
            await this.loadInitialData();
            
            // 現在のフィルター条件で再分析実行
            await this.performAnalysis();
            
            // ユーザーに更新を通知
            showToast('データを最新状態に更新しました', 'success', 2000);
            console.log('✅ Analytics data refreshed successfully');
            
        } catch (error) {
            console.error('Analytics data refresh error:', error);
            showToast('データ更新に失敗しました', 'error');
        }
    }

    setupEventListeners() {
        // ナビゲーションボタン
        document.getElementById('back-to-main').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('performance-dashboard-button').addEventListener('click', () => {
            window.location.href = 'performance.html';
        });


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
        
        // リアルタイムフィルタリング
        this.setupRealtimeFilters();
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
            console.log('Analysis results saved to localStorage with sort state');
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
                    console.log(`Sort state restored: ${this.currentSort} ${this.sortDirection}`);
                } else {
                    this.displayProgressMatrix(analysisData.matrix);
                }
                
                // サマリーダッシュボード表示
                document.getElementById('summary-dashboard').style.display = 'block';
                
                // エクスポートボタンを有効化
                document.getElementById('export-button').disabled = false;
                
                console.log('Analysis results restored from localStorage');
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
            console.log('Analysis results cleared from localStorage');
        } catch (error) {
            console.warn('Failed to clear analysis from localStorage:', error);
        }
    }

    async performAnalysis() {
        showToast('集計中...', 'info');
        
        try {
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
                showToast('期間を選択してください', 'error');
                return;
            }

            if (this.currentFilters.startPeriod > this.currentFilters.endPeriod) {
                showToast('開始年月は終了年月より前に設定してください', 'error');
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
                
                console.log(`Previous sort state restored: ${this.currentSort} ${this.sortDirection}`);
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
            
            showToast('集計が完了しました', 'success');
            
        } catch (error) {
            console.error('Analysis failed:', error);
            showToast('集計に失敗しました', 'error');
        }
    }

    async calculateAnalytics() {
        console.log('Calculating analytics with filters:', this.currentFilters);
        
        // フィルター適用済みクライアント取得
        const filteredClients = this.getFilteredClients();
        console.log(`Filtered clients: ${filteredClients.length}`);
        
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
                const searchTerm = this.currentFilters.businessName.trim().toLowerCase();
                const clientName = client.name.toLowerCase();
                if (!clientName.includes(searchTerm)) {
                    return false;
                }
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
        
        // 各月次レコードのtasksJSONを展開してタスク数を計算
        tasks.forEach(monthlyTask => {
            if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                const tasksList = Object.values(monthlyTask.tasks);
                totalTasks += tasksList.length;
                
                // 完了タスク数を計算
                const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                completedTasks += completedCount;
            }
        });
        
        const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        // 要注意クライアント（進捗率50%未満 または 遅延・停滞ステータス）
        const attentionClients = [];
        clients.forEach(client => {
            const clientMonthlyTasks = tasks.filter(t => t.client_id === client.id);
            let clientTotal = 0;
            let clientCompleted = 0;
            let hasDelayedStatus = false;
            
            clientMonthlyTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    clientTotal += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    clientCompleted += completedCount;
                }
                
                // 遅延・停滞ステータスチェック
                if (monthlyTask.status === '遅延' || monthlyTask.status === '停滞') {
                    hasDelayedStatus = true;
                }
            });
            
            const clientProgressRate = clientTotal > 0 ? (clientCompleted / clientTotal) * 100 : 0;
            
            // 進捗率50%未満 または 遅延・停滞ステータスがある場合
            if ((clientProgressRate < 50 && clientTotal > 0) || hasDelayedStatus) {
                const reason = hasDelayedStatus ? '遅延・停滞' : '進捗率低下';
                attentionClients.push({
                    name: client.name,
                    progressRate: Math.round(clientProgressRate),
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
            const clientMonthlyTasks = tasks.filter(t => t.client_id === client.id);
            let totalTasks = 0;
            let completedTasks = 0;
            
            // クライアントの全タスクを計算
            clientMonthlyTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    totalTasks += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    completedTasks += completedCount;
                }
            });
            
            const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            
            // 担当者名取得
            const staff = this.staffs.find(s => s.id === client.staff_id);
            
            // 月別進捗データ
            const monthlyProgress = this.getMonthlyProgressForClient(client.id, tasks);
            
            return {
                clientId: client.id,
                clientName: client.name,
                staffName: staff ? staff.name : '未設定',
                fiscalMonth: client.fiscal_month,
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
            
            // 各月のタスクレコード内のJSONタスクを計算
            monthTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    totalTasks += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    completedTasks += completedCount;
                }
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
        
        // 要注意クライアントリスト
        const attentionList = document.getElementById('attention-clients-list');
        const attentionContainer = document.getElementById('attention-list');
        
        if (summary.attentionClients.length > 0) {
            this.displayAttentionClients(summary.attentionClients);
            attentionContainer.style.display = 'block';
        } else {
            attentionContainer.style.display = 'none';
        }

        // ステータス別構成円グラフを描画
        this.drawStatusChart(summary.statusComposition);
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
            
            // 基本列
            tr.innerHTML = `
                <td style="border: 1px solid #dee2e6; padding: 8px;">
                    <a href="details.html?id=${row.clientId}" 
                       style="color: #007bff; text-decoration: none; cursor: pointer;"
                       onmouseover="this.style.textDecoration='underline'"
                       onmouseout="this.style.textDecoration='none'">
                        ${row.clientName}
                    </a>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">
                    <span style="font-weight: bold; color: ${this.getProgressColor(row.progressRate)};">
                        ${row.progressRate}%
                    </span>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.staffName}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.fiscalMonth}月</td>
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
                td.innerHTML = `
                    <div style="background: ${progressColor}; color: white; padding: 4px 6px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${monthData.completed}/${monthData.total}
                    </div>
                `;
            } else {
                td.innerHTML = '<span style="color: #999;">-</span>';
            }
            
            tr.appendChild(td);
        }
    }

    sortTableByMonth(monthKey) {
        console.log(`Sorting by month: ${monthKey}`);
        
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
        console.log(`Sorting by: ${sortBy}`);
        
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
            'name': '事業者名',
            'progress': '進捗率', 
            'staff': '担当者',
            'fiscal': '決算月'
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
            console.log(`URL parameter detected: staff=${staffId}`);
            
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
                        console.log('Executing analysis with URL parameters');
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
        const headers = ['事業者名', '期間内平均進捗率', '完了タスク数', '総タスク数', '担当者', '決算月'];
        
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
                `"${row.clientName}"`,
                `${row.progressRate}%`,
                row.completedTasks,
                row.totalTasks,
                `"${row.staffName}"`,
                `${row.fiscalMonth}月`
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
        const headers = ['事業者名', '担当者', '全体進捗率', ...periods];
        data.push(headers);
        
        // マトリクスデータ行作成
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
        console.warn('テーブル形式: SheetJS Community Edition では対応していません');
        
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
        console.warn('条件付き書式: SheetJS Community Edition では対応していません');
        
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
        // PDF用のレポート内容を生成
        const { summary } = this.lastAnalysisData;
        const matrix = this.getSortedMatrix(); // ソート済みデータを取得
        
        // 新しいウィンドウでPDF用のレポートページを開く
        const printWindow = window.open('', '_blank');
        
        const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>進捗分析結果レポート - ${this.getCurrentDateString()}</title>
            <style>
                @page { 
                    size: A4 landscape; 
                    margin: 15mm;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body { 
                    font-family: 'MS Gothic', monospace, sans-serif; 
                    font-size: 12px; 
                    line-height: 1.6;
                    color: #333;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #007bff;
                }
                .header h1 {
                    font-size: 24px;
                    color: #007bff;
                    margin-bottom: 10px;
                }
                .header .date {
                    font-size: 14px;
                    color: #666;
                }
                .summary-section {
                    margin-bottom: 30px;
                }
                .summary-section h2 {
                    font-size: 16px;
                    color: #333;
                    margin-bottom: 15px;
                    padding-left: 10px;
                    border-left: 4px solid #28a745;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .summary-card {
                    border: 1px solid #999;
                    border-radius: 4px;
                    padding: 15px;
                    text-align: center;
                }
                .summary-card .label {
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .summary-card .value {
                    font-size: 18px;
                    font-weight: bold;
                    color: #007bff;
                }
                .attention-clients {
                    margin-top: 15px;
                }
                .attention-clients ul {
                    list-style: none;
                    background: #fff3cd;
                    padding: 10px 15px;
                    border-radius: 4px;
                    border-left: 4px solid #ffc107;
                }
                .attention-clients li {
                    padding: 2px 0;
                    font-size: 11px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                    font-size: 10px;
                }
                th, td {
                    border: 1px solid #333;
                    padding: 8px;
                    text-align: center;
                }
                th {
                    background-color: #f8f9fa;
                    font-weight: bold;
                }
                .progress-high { 
                    background-color: #d4edda !important; 
                    color: #155724; 
                    font-weight: bold; 
                }
                .progress-medium { 
                    background-color: #fff3cd !important; 
                    color: #856404; 
                    font-weight: bold; 
                }
                .progress-low { 
                    background-color: #f8d7da !important; 
                    color: #721c24; 
                    font-weight: bold; 
                }
                .month-cell {
                    font-size: 9px;
                    white-space: nowrap;
                }
                .page-break { page-break-before: always; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 進捗分析結果レポート</h1>
                <div class="date">作成日時: ${new Date().toLocaleString('ja-JP')}</div>
                <div class="date">集計期間: ${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}</div>
                ${this.getFilterInfo().length > 0 ? `<div class="date">検索条件: ${this.getFilterInfo().join(' | ')}</div>` : ''}
                ${this.getSortInfo() ? `<div class="date">並び順: ${this.getSortInfo()}</div>` : ''}
            </div>
            
            <div class="summary-section">
                <h2>📈 集計結果サマリー</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="label">全体進捗率</div>
                        <div class="value">${summary.progressRate}%</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">完了タスク</div>
                        <div class="value">${summary.completedTasks} / ${summary.totalTasks}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">要注意クライアント</div>
                        <div class="value">${summary.attentionClients.length}件</div>
                    </div>
                </div>
                
                ${summary.attentionClients.length > 0 ? `
                <div class="attention-clients">
                    <h3 style="margin-bottom: 10px;">⚠️ 要注意クライアント一覧</h3>
                    <ul>
                        ${summary.attentionClients.map(client => 
                            `<li>${client.name} (${client.reason}: ${client.progressRate}%)</li>`
                        ).join('')}
                    </ul>
                </div>` : ''}
            </div>
            
            <div class="page-break"></div>
            
            <div class="summary-section">
                <h2>📋 進捗マトリクス表（月次進捗含む）</h2>
                ${this.generateMonthlyProgressTable(matrix)}
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
        
        console.log('Default fiscal month sort applied');
    }

    getSortInfo() {
        if (!this.currentSort) {
            return '';
        }

        const sortNames = {
            'name': '事業者名',
            'progress': '進捗率', 
            'staff': '担当者',
            'fiscal': '決算月'
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
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Creating Analytics instance...');
    window.analytics = new AnalyticsPage();
    
    // デバッグ用: グローバル登録確認
    console.log('📊 Analytics instance created:', window.analytics);
    
    try {
        await window.analytics.initialize();
        console.log('✅ Analytics instance fully initialized');
    } catch (error) {
        console.error('❌ Analytics initialization error:', error);
        showToast('分析機能の初期化に失敗しました', 'error');
        
        // 最低限のUIは動作するようにする
        window.analytics.setupEventListeners();
    }
});