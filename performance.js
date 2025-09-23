// 担当者別パフォーマンスダッシュボード
import { SupabaseAPI } from './supabase-client.js';
import './toast.js'; // showToastはwindow.showToastとしてグローバルに利用可能

class PerformancePage {
    constructor() {
        this.clients = [];
        this.staffs = [];
        this.monthlyTasks = [];
        this.performanceData = null;
        this.currentSort = null;
        this.sortDirection = 'desc'; // デフォルトは降順（パフォーマンスが良い順）
    }

    async initialize() {
        console.log('Performance page initializing...');
        
        try {
            // 認証状態確認
            const user = await SupabaseAPI.getCurrentUser();
            if (!user) {
                showToast('認証が必要です', 'error');
                window.location.href = 'analytics.html';
                return;
            }

            // ページ可視性変更の監視を設定（他ページからの戻り検出）
            this.setupPageVisibilityListener();

            // 基本データ読み込み
            await this.loadInitialData();
            
            // UI初期化
            this.setupEventListeners();
            this.setupPeriodSelector();
            
            // 初期分析を自動実行
            setTimeout(async () => {
                await this.performAnalysis();
            }, 500); // UI初期化完了後に実行
            
            console.log('Performance page initialized successfully');
            showToast('担当者別パフォーマンス分析画面を読み込みました', 'success');
            
        } catch (error) {
            console.error('Performance page initialization failed:', error);
            showToast('パフォーマンス分析画面の初期化に失敗しました', 'error');
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

    setupPageVisibilityListener() {
        // ページの表示/非表示状態を監視
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden && this.performanceData) {
                // ページが表示状態になった時に、既に分析データがある場合は再計算
                console.log('📊 Performance page became visible, refreshing data...');
                await this.refreshPerformanceData();
            }
        });

        // ページフォーカス時にも更新（ブラウザタブ切り替えで戻った場合）
        window.addEventListener('focus', async () => {
            if (this.performanceData) {
                console.log('🔍 Performance window focused, checking for data updates...');
                await this.refreshPerformanceData();
            }
        });
    }

    async refreshPerformanceData() {
        try {
            // 期間設定を保持したままデータを再読み込み
            await this.loadInitialData();
            
            // 現在の期間設定で再分析実行
            await this.performAnalysis();
            
            // ユーザーに更新を通知
            showToast('データを最新状態に更新しました', 'success', 2000);
            
        } catch (error) {
            console.error('Performance data refresh error:', error);
            showToast('データ更新に失敗しました', 'error');
        }
    }

    setupEventListeners() {
        // 統一ナビゲーションタブはHTMLのリンクで動作するため、イベントリスナー不要


        // ソート機能
        document.querySelectorAll('[data-sort]').forEach(header => {
            header.addEventListener('click', (e) => {
                this.sortTable(e.target.closest('[data-sort]').dataset.sort);
            });
        });

        // 期間選択変更イベント
        document.getElementById('evaluation-period').addEventListener('change', (e) => {
            const customContainer = document.getElementById('custom-period-container');
            if (e.target.value === 'custom') {
                customContainer.style.display = 'block';
                this.setDefaultCustomPeriod();
            } else {
                customContainer.style.display = 'none';
            }
        });
        
        // リアルタイムフィルタリング
        this.setupRealtimeFilters();
    }

    setupRealtimeFilters() {
        // デバウンス用のタイマー
        let debounceTimer = null;
        
        const debouncedAnalysis = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                await this.performAnalysis();
            }, 300); // 300ms のデバウンス
        };
        
        // 期間選択変更時
        document.getElementById('evaluation-period').addEventListener('change', debouncedAnalysis);
        
        // カスタム期間変更時
        const customStartPeriod = document.getElementById('custom-start-period');
        const customEndPeriod = document.getElementById('custom-end-period');
        
        if (customStartPeriod) {
            customStartPeriod.addEventListener('change', debouncedAnalysis);
        }
        if (customEndPeriod) {
            customEndPeriod.addEventListener('change', debouncedAnalysis);
        }
    }

    setupPeriodSelector() {
        // デフォルト期間を設定（過去12ヶ月）
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 11, 1);
        const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        
        document.getElementById('custom-start-period').value = 
            `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}`;
        document.getElementById('custom-end-period').value = 
            `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    setDefaultCustomPeriod() {
        // カスタム期間選択時のデフォルト値設定
        this.setupPeriodSelector();
    }

    getPeriodRange() {
        const periodType = document.getElementById('evaluation-period').value;
        const currentDate = new Date();
        let startDate, endDate;

        switch (periodType) {
            case 'current-year':
                startDate = new Date(currentDate.getFullYear(), 0, 1); // 1月1日
                endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                break;
            case 'last-quarter':
                const quarterStart = Math.floor(currentDate.getMonth() / 3) * 3 - 3;
                startDate = new Date(currentDate.getFullYear(), quarterStart, 1);
                endDate = new Date(currentDate.getFullYear(), quarterStart + 2, 1);
                if (quarterStart < 0) {
                    startDate = new Date(currentDate.getFullYear() - 1, 9, 1); // 前年Q4
                    endDate = new Date(currentDate.getFullYear() - 1, 11, 1);
                }
                break;
            case 'last-6-months':
                startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);
                endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                break;
            case 'last-12-months':
                startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 11, 1);
                endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                break;
            case 'custom':
                const startValue = document.getElementById('custom-start-period').value;
                const endValue = document.getElementById('custom-end-period').value;
                if (!startValue || !endValue) {
                    throw new Error('カスタム期間を正しく設定してください');
                }
                startDate = new Date(startValue + '-01');
                endDate = new Date(endValue + '-01');
                break;
            default:
                throw new Error('無効な期間タイプです');
        }

        return {
            start: `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}`,
            end: `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}`
        };
    }

    async performAnalysis() {
        showToast('パフォーマンス分析中...', 'info');
        
        try {
            // 期間取得
            const period = this.getPeriodRange();
            
            if (period.start > period.end) {
                showToast('開始期間は終了期間より前に設定してください', 'error');
                return;
            }

            // パフォーマンス分析実行
            this.performanceData = await this.calculatePerformanceMetrics(period);
            
            // 結果表示
            this.displayPerformanceResults(this.performanceData);
            
            showToast('パフォーマンス分析が完了しました', 'success');
            
        } catch (error) {
            console.error('Performance analysis failed:', error);
            showToast(`分析に失敗しました: ${error.message}`, 'error');
        }
    }

    async calculatePerformanceMetrics(period) {
        console.log('Calculating performance metrics for period:', period);
        
        const performanceMetrics = [];
        
        // 各担当者について分析
        for (const staff of this.staffs) {
            const staffClients = this.clients.filter(client => client.staff_id === staff.id);
            const staffClientIds = staffClients.map(c => c.id);
            
            // 期間内の月次タスクを取得
            const periodTasks = this.monthlyTasks.filter(task => {
                if (!staffClientIds.includes(task.client_id)) return false;
                return task.month >= period.start && task.month <= period.end;
            });

            // メトリクス計算
            const metrics = this.calculateStaffMetrics(staffClients, periodTasks, period);
            
            performanceMetrics.push({
                staffId: staff.id,
                staffName: staff.name,
                ...metrics
            });
        }
        
        return performanceMetrics;
    }

    calculateStaffMetrics(staffClients, periodTasks, period) {
        let totalTasks = 0;
        let completedTasks = 0;
        
        // 各月次タスクレコード内のJSONタスクを計算
        periodTasks.forEach(monthlyTask => {
            if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                const tasksList = Object.values(monthlyTask.tasks);
                totalTasks += tasksList.length;
                
                const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                completedTasks += completedCount;
            }
        });
        
        const avgCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        // 完了月数の計算（月別で100%完了した月の数）
        const completedMonths = this.calculateCompletedMonths(staffClients, periodTasks, period);
        
        // 遅延発生月数の計算（重複月を除外）
        const delayedMonths = this.calculateDelayedMonths(staffClients, periodTasks, period);
        
        // パフォーマンス評価
        const performanceLevel = this.getPerformanceLevel(avgCompletionRate);
        
        return {
            clientCount: staffClients.length,
            totalTasks,
            completedTasks,
            avgCompletionRate,
            completedMonths,
            delayedMonths,
            performanceLevel,
            staffClients: staffClients // 詳細確認用
        };
    }

    calculateCompletedMonths(staffClients, periodTasks, period) {
        const startDate = new Date(period.start + '-01');
        const endDate = new Date(period.end + '-01');
        let completedMonths = 0;
        
        // 担当者のクライアントIDを取得
        const clientIds = staffClients.map(client => client.id);
        
        // 各月について、担当者の各クライアントのタスクが100%完了している延べ月数をカウント
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            
            // この月の担当者のクライアントのタスクレコードを取得
            const monthTasks = periodTasks.filter(task => 
                task.month === monthKey && clientIds.includes(task.client_id)
            );
            
            // 各クライアント（月次タスクレコード）について100%完了かチェック
            monthTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    const totalTasks = tasksList.length;
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    
                    // このクライアント×この月が100%完了している場合、延べ月数にカウント
                    if (totalTasks > 0 && completedCount === totalTasks) {
                        completedMonths++;
                    }
                }
            });
        }
        
        return completedMonths;
    }

    calculateDelayedMonths(staffClients, periodTasks, period) {
        const startDate = new Date(period.start + '-01');
        const endDate = new Date(period.end + '-01');
        let delayedMonths = 0;
        
        // 担当者のクライアントIDを取得
        const clientIds = staffClients.map(client => client.id);
        
        // 各月について、担当者の各クライアントで遅延・停滞している延べ月数をカウント
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            
            // この月の担当者のクライアントのタスクレコードを取得
            const monthTasks = periodTasks.filter(task => 
                task.month === monthKey && clientIds.includes(task.client_id)
            );
            
            // 各クライアント（月次タスクレコード）について遅延・停滞かチェック
            monthTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    const totalTasks = tasksList.length;
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    const progressRate = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
                    
                    // このクライアント×この月が遅延ステータス（進捗率50%未満または明示的ステータス）の場合、延べ月数にカウント
                    if (progressRate < 50 || monthlyTask.status === '遅延' || monthlyTask.status === '停滞') {
                        delayedMonths++;
                    }
                }
            });
        }
        
        return delayedMonths;
    }

    getPerformanceLevel(completionRate) {
        if (completionRate >= 95) return { level: '優秀', color: '#28a745', score: 4 };
        if (completionRate >= 85) return { level: '良好', color: '#17a2b8', score: 3 };
        if (completionRate >= 70) return { level: '標準', color: '#ffc107', score: 2 };
        return { level: '要改善', color: '#dc3545', score: 1 };
    }

    displayPerformanceResults(performanceData) {
        const tbody = document.getElementById('performance-table-body');
        tbody.innerHTML = '';

        // 担当クライアント数が0の担当者を除外し、デフォルトソート（IDで昇順）
        const filteredData = performanceData.filter(staff => staff.clientCount > 0);
        const sortedData = [...filteredData].sort((a, b) => a.staffId - b.staffId);

        sortedData.forEach(staff => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.staffId}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px;">
                    <strong>${staff.staffName}</strong>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.clientCount}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    <span style="font-weight: bold; color: ${staff.performanceLevel.color};">
                        ${staff.avgCompletionRate}%
                    </span>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.completedMonths}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.delayedMonths}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    <span style="background: ${staff.performanceLevel.color}; color: ${staff.performanceLevel.color === '#ffc107' ? 'black' : 'white'}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${staff.performanceLevel.level}
                    </span>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    <button onclick="performance.viewStaffDetails(${staff.staffId}, '${staff.staffName}')" 
                            style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        詳細確認
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // 初期ソート表示の更新
        this.currentSort = 'avg-completion';
        this.sortDirection = 'desc';
        this.updateSortIcons('avg-completion');
    }

    sortTable(sortBy) {
        if (!this.performanceData) {
            showToast('先にパフォーマンス分析を実行してください', 'info');
            return;
        }

        // ソート状態管理
        if (this.currentSort === sortBy) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = sortBy;
            this.sortDirection = 'desc'; // デフォルトは降順
        }

        // 担当クライアント数が0の担当者を除外してソート実行
        const filteredData = this.performanceData.filter(staff => staff.clientCount > 0);
        let sortedData = [...filteredData];
        
        sortedData.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'name':
                    aValue = a.staffName;
                    bValue = b.staffName;
                    break;
                case 'client-count':
                    aValue = a.clientCount;
                    bValue = b.clientCount;
                    break;
                case 'avg-completion':
                    aValue = a.avgCompletionRate;
                    bValue = b.avgCompletionRate;
                    break;
                case 'completed-months':
                    aValue = a.completedMonths;
                    bValue = b.completedMonths;
                    break;
                case 'delayed-months':
                    aValue = a.delayedMonths;
                    bValue = b.delayedMonths;
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
        this.displaySortedResults(sortedData);
        
        const sortLabels = {
            'name': '担当者名',
            'client-count': '担当クライアント数',
            'avg-completion': '平均完了率',
            'completed-months': '完了月数',
            'delayed-months': '遅延発生月数'
        };
        
        showToast(`${sortLabels[sortBy]}で${this.sortDirection === 'asc' ? '昇順' : '降順'}ソート`, 'success');
    }

    displaySortedResults(sortedData) {
        const tbody = document.getElementById('performance-table-body');
        tbody.innerHTML = '';

        // 担当クライアント数が0の担当者を除外
        const filteredData = sortedData.filter(staff => staff.clientCount > 0);

        filteredData.forEach(staff => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.staffId}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px;">
                    <strong>${staff.staffName}</strong>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.clientCount}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    <span style="font-weight: bold; color: ${staff.performanceLevel.color};">
                        ${staff.avgCompletionRate}%
                    </span>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.completedMonths}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    ${staff.delayedMonths}
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    <span style="background: ${staff.performanceLevel.color}; color: ${staff.performanceLevel.color === '#ffc107' ? 'black' : 'white'}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${staff.performanceLevel.level}
                    </span>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center;">
                    <button onclick="performance.viewStaffDetails(${staff.staffId}, '${staff.staffName}')" 
                            style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        詳細確認
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
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

    // 担当者詳細確認機能
    viewStaffDetails(staffId, staffName) {
        console.log(`Viewing details for staff: ${staffId} (${staffName})`);
        
        // 確認のトースト通知
        showToast(`${staffName}さんの詳細分析画面に移動します`, 'info');
        
        // 少し遅延させてから遷移（トースト表示のため）
        setTimeout(() => {
            // URLパラメータを明示的に設定して遷移
            const analyticsUrl = `analytics.html?staff=${staffId}&from=performance&t=${Date.now()}`;
            console.log(`Navigating to: ${analyticsUrl}`);
            window.location.href = analyticsUrl;
        }, 800);
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    window.performance = new PerformancePage();
    await window.performance.initialize();

    // 設定画面リンクのイベントリスナー
    const settingsLink = document.querySelector('.nav-tab.settings');
    if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            SupabaseAPI.redirectToSettings();
        });
    }
});