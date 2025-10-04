// タスク管理システム - メイン機能
import { supabase } from '../../supabase-client.js';
import { formatDate, normalizeText } from '../../utils.js';
import '../../toast.js'; // showToastはwindow.showToastとしてグローバルに利用可能
import { BusinessDayCalculator } from './business-day-calculator.js';
import { HolidayGenerator } from './holiday-generator.js';

// URL自動リンク化機能
function autoLinkifyText(text) {
    const urlRegex = /(https?:\/\/[^\s\n]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" style="color: #007bff; text-decoration: underline; cursor: pointer;">$1</a>');
}

function createLinkedTextDisplay(textarea) {
    // 表示用のdivを作成
    const displayDiv = document.createElement('div');
    displayDiv.className = 'linked-text-display';
    displayDiv.style.display = 'none'; // 初期は非表示

    // テキストエリアの後に表示用divを挿入
    textarea.parentNode.insertBefore(displayDiv, textarea.nextSibling);

    function updateDisplay() {
        const text = textarea.value;
        if (text.trim()) {
            displayDiv.innerHTML = autoLinkifyText(text);
        } else {
            displayDiv.innerHTML = '';
        }
    }

    // 表示div をクリックしたらテキストエリアに切り替え
    displayDiv.addEventListener('click', (e) => {
        // リンクをクリックした場合は編集モードに入らない
        if (e.target.tagName !== 'A') {
            displayDiv.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
        }
    });

    // テキストエリアからフォーカスが外れたら表示モードに切り替え
    textarea.addEventListener('blur', () => {
        updateDisplay();
        textarea.style.display = 'none';
        displayDiv.style.display = 'block';
    });

    // 初期化時に表示を更新
    updateDisplay();

    return { displayDiv, updateDisplay };
}

class TaskManagement {
    constructor() {
        this.currentUser = null;
        this.clients = [];
        this.staffs = [];
        this.tasks = [];
        this.templates = [];
        this.recurringTasks = [];
        this.currentFilters = {
            status: '',
            client: '',
            search: ''
        };
        this.currentSort = { field: 'default_priority', direction: 'asc' };
        this.currentDisplay = 'list';

        // スマート通知システム設定
        this.autoRefreshInterval = null;
        this.smartNotificationInterval = null;
        this.lastUpdateTime = new Date();
        this.isUserInteracting = false; // ユーザー操作中フラグ
        this.pendingNotifications = new Map(); // 通知待ちタスク管理
        this.lastTaskCount = 0; // 前回のタスク数

        // 高機能履歴管理システム
        this.historyMode = false; // 履歴表示モード
        this.historyPeriod = 'current'; // 'current', '7days', '30days', 'all'
        this.allTasks = []; // 履歴含む全タスク
        // 履歴表示では「確認完了」のみ表示（チェックボックス削除済み）

        // 簡易表示モード設定（デフォルト: ON）
        this.isSimpleView = true; // 簡易表示モード

        // 営業日計算ツール
        this.businessDayCalc = new BusinessDayCalculator();

        // 休日自動生成ツール
        this.holidayGenerator = new HolidayGenerator();

        this.init();
        this.setupHistoryManagement(); // 履歴管理システム初期化
    }

    // タスク管理ページかどうかを判定
    isTaskManagementPage() {
        // URLパスでの判定
        const path = window.location.pathname;
        if (path.includes('task-management.html')) {
            return true;
        }

        // DOM要素での判定（より確実）
        const taskManagementElements = [
            'task-display-area',
            'assignee-sidebar',
            'tasks-table'
        ];

        return taskManagementElements.some(id => document.getElementById(id) !== null);
    }

    // 現在のユーザー情報を表示
    displayCurrentUserInfo() {
        const userInfoElement = document.getElementById('current-user-info');
        if (!userInfoElement || !this.currentUser) return;

        userInfoElement.innerHTML = `
            <div style="font-weight: 600;font-size: 24px; color: #495057cc;">${this.currentUser.name || 'ユーザー名なし'}</div>
            <div style="font-size: 13px; color: #6c757d;">${this.currentUser.email || 'メールなし'}</div>
        `;
    }

    async init() {
        try {
            // タスク管理ページでのみ動作するようにチェック
            if (!this.isTaskManagementPage()) {
                console.log('Not on task management page - TaskManagement initialization skipped');
                return;
            }

            // 認証確認
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = '/';
                return;
            }

            // 選択された担当者IDを取得
            const selectedStaffId = sessionStorage.getItem('selected-staff-id');

            if (selectedStaffId) {
                // 担当者選択済みの場合：選択されたstaff_idで情報を取得
                const { data: staffData } = await supabase
                    .from('staffs')
                    .select('*')
                    .eq('id', parseInt(selectedStaffId))
                    .single();

                this.currentUser = staffData;
                console.log('Current user (selected staff):', this.currentUser);
            } else {
                // 担当者未選択の場合：メールアドレスで情報を取得（後方互換性）
                const { data: staffData } = await supabase
                    .from('staffs')
                    .select('*')
                    .eq('email', user.email)
                    .single();

                this.currentUser = staffData;
                console.log('Current user (email-based):', this.currentUser);
            }

            // ユーザー情報表示
            this.displayCurrentUserInfo();

            // 基本データ読み込み（並列実行で高速化）
            await Promise.all([
                this.loadMasterData(),
                this.loadTemplates(),
                this.loadRecurringTasks(),
                this.loadTasks(),
                this.businessDayCalc.loadHolidays()  // 休日データ読み込み
            ]);

            // UI初期化
            this.initializeUI();
            this.setupEventListeners();

            // 担当者サイドバーの初期化（全データロード完了後に実行）
            this.initializeAssigneeSidebar();
            this.updateDisplay();
            this.updateSummary();

            // スマート通知システム開始
            this.startSmartNotificationSystem();

            // ページ離脱時の清掃処理
            window.addEventListener('beforeunload', () => {
                this.stopAutoRefresh();
            });

            console.log('Task Management System initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('初期化に失敗しました', 'error');
        }
    }

    async loadMasterData() {
        try {
            // クライアント取得
            const { data: clientsData, error: clientsError } = await supabase
                .from('clients')
                .select('id, name')
                .eq('status', 'active')
                .order('name');

            if (clientsError) throw clientsError;
            this.clients = clientsData;

            // スタッフ取得
            const { data: staffsData, error: staffsError } = await supabase
                .from('staffs')
                .select('id, name')
                .order('name');

            if (staffsError) throw staffsError;
            this.staffs = staffsData;

            console.log('Master data loaded:', {
                clients: this.clients.length,
                staffs: this.staffs.length
            });

            // ドロップダウン更新
            this.updateDropdowns();

        } catch (error) {
            console.error('Master data loading error:', error);
            throw error;
        }
    }

    async loadTemplates() {
        try {
            // 全テンプレートを取得（is_globalフィールドがない場合に備えて）
            const { data: templatesData, error } = await supabase
                .from('task_templates')
                .select('*')
                .order('template_name', { ascending: true });

            if (error) throw error;

            this.templates = templatesData || [];
            console.log('Templates loaded:', this.templates.length);

        } catch (error) {
            console.error('Templates loading error:', error);
            // エラーが発生しても初期化は続行
            this.templates = [];
        }
    }

    async loadRecurringTasks() {
        try {
            const { data: recurringData, error } = await supabase
                .from('recurring_tasks')
                .select(`
                    *,
                    client:clients(id, name),
                    assignee:staffs(id, name)
                `)
                .eq('is_active', true)
                .eq('created_by_email', this.currentUser.email)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.recurringTasks = recurringData || [];
            console.log('Recurring tasks loaded:', this.recurringTasks.length);

        } catch (error) {
            console.error('Recurring tasks loading error:', error);
            // エラーが発生しても初期化は続行
            this.recurringTasks = [];
        }
    }

    updateDropdowns() {
        // モーダル用ドロップダウン（受任者のみ）
        const assigneeSelect = document.getElementById('assignee-select');

        // モーダル - 受任者
        assigneeSelect.innerHTML = '<option value="">選択してください</option>';
        // ID順でソート
        const sortedStaffs = [...this.staffs].sort((a, b) => a.id - b.id);
        sortedStaffs.forEach(staff => {
            assigneeSelect.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
        });

        // 月次自動タスク用の受託者ドロップダウンも更新
        const defaultAssigneeSelect = document.getElementById('template-default-assignee');
        if (defaultAssigneeSelect) {
            defaultAssigneeSelect.innerHTML = '<option value="">選択してください</option>';
            sortedStaffs.forEach(staff => {
                defaultAssigneeSelect.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
            });
        }

        // 一般テンプレート用の受託者ドロップダウンも更新
        const defaultAssigneeGeneralSelect = document.getElementById('template-default-assignee-general');
        if (defaultAssigneeGeneralSelect) {
            defaultAssigneeGeneralSelect.innerHTML = '<option value="">選択してください</option>';
            sortedStaffs.forEach(staff => {
                defaultAssigneeGeneralSelect.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
            });
        }

        // 検索可能プルダウンのオプションを更新（後で実行）
        if (this.searchableSelect) {
            this.searchableSelect.updateOptions();
        }

        // フィルター用検索可能プルダウンのオプションを更新
        if (this.filterSearchableSelect) {
            this.filterSearchableSelect.updateOptions();
        }
    }

    async loadTasks() {
        try {
            const { data: tasksData, error } = await supabase
                .from('tasks')
                .select(`
                    *,
                    clients:client_id (id, name),
                    assignee:assignee_id (id, name),
                    requester:requester_id (id, name)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.tasks = tasksData || [];
            console.log('Tasks loaded:', this.tasks.length);

            // 初回読み込み時のタスク数を設定（新規タスク検知のため）
            if (this.lastTaskCount === 0) {
                this.lastTaskCount = this.tasks.length;
            }

        } catch (error) {
            console.error('Tasks loading error:', error);
            showToast('タスクの読み込みに失敗しました', 'error');
        }
    }

    initializeUI() {
        // 保存されたフィルター状態を復元
        this.updateFilterUI();

        // HTMLのactiveボタンから現在の表示形式を取得
        const activeBtn = document.querySelector('.display-btn.active');
        if (activeBtn) {
            this.currentDisplay = activeBtn.dataset.display;
            console.log('Initial display mode from HTML:', this.currentDisplay);
        }

        // 表示切替（状態保存を避けるため直接実行）
        document.querySelectorAll('.task-view').forEach(view => {
            view.style.display = 'none';
        });
        const targetView = document.getElementById(`${this.currentDisplay}-view`);
        if (targetView) {
            targetView.style.display = 'block';
        }
    }

    setupEventListeners() {
        // 表示形式切替ボタン
        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.display-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentDisplay = e.target.dataset.display;
                this.switchDisplay(this.currentDisplay);
            });
        });

        // フィルター（client-filterは検索可能プルダウンで処理）
        ['status-filter'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                const filterType = id.replace('-filter', '');
                this.currentFilters[filterType] = e.target.value;
                this.updateDisplay();
                this.saveFilterState(); // 状態を保存
            });
        });

        // 検索
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.currentFilters.search = e.target.value;
            this.updateDisplay();
            this.saveFilterState(); // 状態を保存
        });

        // フィルターリセットボタン
        document.getElementById('reset-filters-btn').addEventListener('click', () => {
            this.resetFilters();
        });

        // タブ切り替え時の状態維持（ページが非表示になる前に保存）
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.saveFilterState();
            }
        });

        // ページ離脱時の状態保存
        window.addEventListener('beforeunload', () => {
            this.saveFilterState();
        });

        // ガントチャート：休日管理ボタン
        const addHolidayBtn = document.getElementById('gantt-add-holiday-btn');
        if (addHolidayBtn) {
            addHolidayBtn.addEventListener('click', () => {
                this.openHolidayModal();
            });
        }

        // 休日管理モーダル関連
        const holidayModalClose = document.getElementById('holiday-modal-close');
        if (holidayModalClose) {
            holidayModalClose.addEventListener('click', () => {
                this.closeHolidayModal();
            });
        }

        // 休日管理：タブ切り替え
        const companyTab = document.getElementById('holiday-tab-company');
        const csvTab = document.getElementById('holiday-tab-csv');
        if (companyTab && csvTab) {
            companyTab.addEventListener('click', () => {
                this.switchHolidayTab('company');
            });
            csvTab.addEventListener('click', () => {
                this.switchHolidayTab('csv');
            });
        }

        // 休日管理：会社休日追加
        const addCompanyHolidayBtn = document.getElementById('add-company-holiday-btn');
        if (addCompanyHolidayBtn) {
            addCompanyHolidayBtn.addEventListener('click', () => {
                this.addCompanyHoliday();
            });
        }

        // CSV：エクスポートボタン
        const exportHolidaysCsvBtn = document.getElementById('export-holidays-csv-btn');
        if (exportHolidaysCsvBtn) {
            exportHolidaysCsvBtn.addEventListener('click', () => {
                this.exportHolidaysCSV();
            });
        }

        // CSV：インポートボタン
        const importHolidaysCsvBtn = document.getElementById('import-holidays-csv-btn');
        if (importHolidaysCsvBtn) {
            importHolidaysCsvBtn.addEventListener('click', () => {
                this.importHolidaysCSV();
            });
        }

        // ガントチャート：確認待ち折りたたみ
        const workingHeader = document.getElementById('working-tasks-header');
        const workingList = document.getElementById('working-tasks-list');
        if (workingHeader && workingList) {
            workingHeader.addEventListener('click', () => {
                const isVisible = workingList.style.display !== 'none';
                workingList.style.display = isVisible ? 'none' : 'block';
                workingHeader.innerHTML = workingHeader.innerHTML.replace(
                    isVisible ? '▼' : '▶',
                    isVisible ? '▶' : '▼'
                );
            });
        }

        // ガントチャート：確認完了折りたたみ
        const completedHeader = document.getElementById('completed-tasks-header');
        const completedList = document.getElementById('completed-tasks-list');
        if (completedHeader && completedList) {
            completedHeader.addEventListener('click', () => {
                const isVisible = completedList.style.display !== 'none';
                completedList.style.display = isVisible ? 'none' : 'block';
                completedHeader.innerHTML = completedHeader.innerHTML.replace(
                    isVisible ? '▼' : '▶',
                    isVisible ? '▶' : '▼'
                );
            });
        }

        // 簡易表示トグルスイッチ
        const simpleViewCheckbox = document.getElementById('simple-view-checkbox');
        if (simpleViewCheckbox) {
            simpleViewCheckbox.addEventListener('change', (e) => {
                this.toggleSimpleView(e.target.checked);
            });

            // LocalStorageから設定を復元（未設定の場合はデフォルトON）
            const savedSimpleView = localStorage.getItem('taskManagement_simpleView');
            if (savedSimpleView !== null) {
                // 保存された設定がある場合はそれを使用
                const isSimple = savedSimpleView === 'true';
                simpleViewCheckbox.checked = isSimple;
                this.toggleSimpleView(isSimple);
            } else {
                // 保存された設定がない場合はデフォルトON
                simpleViewCheckbox.checked = true;
                this.toggleSimpleView(true);
            }
        }

        // ソート（テーブルヘッダー）
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', (e) => {
                const field = e.target.dataset.sort;
                if (this.currentSort.field === field) {
                    this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    this.currentSort.field = field;
                    this.currentSort.direction = 'asc';
                }
                this.updateDisplay();
            });
        });

        // 新規タスクボタン
        document.getElementById('add-task-btn').addEventListener('click', () => {
            this.openTaskModal();
        });

        // テンプレートボタン
        document.getElementById('template-btn').addEventListener('click', () => {
            // 新しいUIが利用可能かチェック
            const hasNewUI = document.querySelector('.template-main-content');
            if (hasNewUI) {
                console.log('🚀 新しいテンプレートUIを使用します');
                this.openTemplateModalV2();
            } else {
                console.log('📋 従来のテンプレートUIを使用します');
                this.openTemplateModal();
            }
        });

        // タスクモーダル関連
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeTaskModal();
        });

        // 古いcancel-btnは削除されているため、コメントアウト
        // document.getElementById('cancel-btn').addEventListener('click', () => {
        //     this.closeTaskModal();
        // });

        document.getElementById('save-task-btn').addEventListener('click', () => {
            this.saveTask();
        });

        // 閲覧モードボタン
        document.getElementById('close-view-btn').addEventListener('click', () => {
            this.closeTaskModal();
        });

        document.getElementById('edit-mode-btn').addEventListener('click', () => {
            this.setModalMode('edit');
        });

        // 編集モードボタン
        document.getElementById('cancel-edit-btn').addEventListener('click', () => {
            this.closeTaskModal();
        });

        document.getElementById('delete-task-btn').addEventListener('click', () => {
            const taskId = document.getElementById('task-form').dataset.taskId;
            if (taskId) {
                this.deleteTask(parseInt(taskId));
            }
        });

        // テンプレートモーダル関連
        document.getElementById('template-modal-close').addEventListener('click', () => {
            this.closeTemplateModal();
        });

        document.getElementById('template-cancel-btn').addEventListener('click', () => {
            this.closeTemplateModal();
        });

        // テンプレート編集モーダル関連のイベントリスナー
        this.setupTemplateEditModalEvents();

        // タスクモーダルは誤操作防止のため、モーダル外クリックでは閉じない
        // （ユーザーからの要望により無効化）

        document.getElementById('template-modal').addEventListener('click', (e) => {
            if (e.target.id === 'template-modal') {
                this.closeTemplateModal();
            }
        });

        // URL自動リンク化機能の初期化
        this.initializeLinkedTextDisplay();

        // 検索可能プルダウンの初期化
        this.initializeSearchableSelect();
        this.initializeFilterSearchableSelect();
        this.initializeTemplateClientSelect();

        // 「随時」チェックボックスの制御
        const isAnytimeCheckbox = document.getElementById('is-anytime');
        const dueDateInput = document.getElementById('due-date');
        if (isAnytimeCheckbox && dueDateInput) {
            isAnytimeCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    // 随時にチェックが入ったら期限日をグレーアウト＆クリア
                    dueDateInput.disabled = true;
                    dueDateInput.value = '';
                    dueDateInput.style.backgroundColor = '#e9ecef';
                } else {
                    // 随時のチェックを外したら期限日を有効化
                    dueDateInput.disabled = false;
                    dueDateInput.style.backgroundColor = '';
                }
            });
        }
    }

    initializeLinkedTextDisplay() {
        const taskDescriptionTextarea = document.getElementById('task-description');
        if (taskDescriptionTextarea) {
            this.linkedTextDisplay = createLinkedTextDisplay(taskDescriptionTextarea);
        }

        // 参照URLフィールドにもURL自動リンク化を適用
        const referenceUrlInput = document.getElementById('reference-url');
        if (referenceUrlInput) {
            this.referenceUrlDisplay = createLinkedTextDisplay(referenceUrlInput);
        }
    }

    initializeSearchableSelect() {
        const searchInput = document.getElementById('client-search');
        const dropdown = document.getElementById('client-dropdown');
        const hiddenSelect = document.getElementById('client-select');
        const wrapper = searchInput.parentElement;

        let highlightedIndex = -1;
        let allOptions = [];

        // オプションデータを準備（正規化キャッシュ付き）
        const updateOptions = () => {
            allOptions = [
                {
                    value: '0',
                    text: 'その他業務',
                    searchText: 'その他業務',
                    normalizedText: normalizeText('その他業務')
                },
                ...this.clients.map(client => ({
                    value: client.id.toString(),
                    text: client.name,
                    searchText: client.name,
                    normalizedText: normalizeText(client.name) // 正規化済みテキストをキャッシュ
                }))
            ];

            // 隠しselect要素にもoption要素を追加（フォーム送信で正常に値が送られるようにするため）
            const currentValue = hiddenSelect.value; // 現在の値を保持
            hiddenSelect.innerHTML = '<option value="">選択してください</option>' +
                allOptions.map(option =>
                    `<option value="${option.value}">${option.text}</option>`
                ).join('');
            hiddenSelect.value = currentValue; // 値を復元
        };

        // ドロップダウンを表示
        const showDropdown = () => {
            dropdown.style.display = 'block';
            wrapper.classList.add('open');
            renderOptions();
        };

        // ドロップダウンを非表示
        const hideDropdown = () => {
            dropdown.style.display = 'none';
            wrapper.classList.remove('open');
            highlightedIndex = -1;
        };

        // スマート検索機能（正規化対応）
        const smartSearch = (searchTerm, option) => {
            if (!searchTerm) return true;

            const normalizedSearchTerm = normalizeText(searchTerm);

            // 複数の検索方式を試行
            return (
                // 1. 原文での部分マッチ（従来通り）
                option.searchText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                // 2. 正規化後の部分マッチ（全角半角、ひらがなカタカナ統一）
                option.normalizedText.includes(normalizedSearchTerm) ||
                // 3. 先頭マッチ（優先表示のため）
                option.normalizedText.startsWith(normalizedSearchTerm) ||
                // 4. 単語境界でのマッチ（スペース区切りや記号区切り）
                option.normalizedText.split(/[\s\-_.()（）]/g).some(word =>
                    word.startsWith(normalizedSearchTerm)
                )
            );
        };

        // オプションをレンダリング（スマート検索対応）
        const renderOptions = (searchTerm = '') => {
            const filtered = allOptions.filter(option => smartSearch(searchTerm, option));

            // 検索結果を関連度でソート
            if (searchTerm) {
                const normalizedSearchTerm = normalizeText(searchTerm);
                filtered.sort((a, b) => {
                    // 1. 完全一致が最優先
                    const aExact = a.normalizedText === normalizedSearchTerm;
                    const bExact = b.normalizedText === normalizedSearchTerm;
                    if (aExact !== bExact) return bExact - aExact;

                    // 2. 先頭マッチが次に優先
                    const aStarts = a.normalizedText.startsWith(normalizedSearchTerm);
                    const bStarts = b.normalizedText.startsWith(normalizedSearchTerm);
                    if (aStarts !== bStarts) return bStarts - aStarts;

                    // 3. 短い名前が優先（より具体的）
                    return a.text.length - b.text.length;
                });
            }

            if (filtered.length === 0) {
                dropdown.innerHTML = `<div class="searchable-select-no-results">「${searchTerm}」に該当する事業者が見つかりません</div>`;
                return;
            }

            dropdown.innerHTML = filtered.map((option, index) => {
                const isSelected = hiddenSelect.value === option.value;
                let displayText = option.text;

                // 検索語をハイライト表示
                if (searchTerm) {
                    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    displayText = option.text.replace(regex, '<mark style="background: #fff3cd; padding: 0;">$1</mark>');
                }

                return `<div class="searchable-select-item ${isSelected ? 'selected' : ''}" data-value="${option.value}" data-index="${index}" data-text="${option.text}">${displayText}</div>`;
            }).join('');

            // 現在選択されているアイテムがあればハイライト
            const selectedItem = dropdown.querySelector('.searchable-select-item.selected');
            if (selectedItem) {
                highlightedIndex = parseInt(selectedItem.dataset.index);
                selectedItem.classList.add('highlighted');
            }
        };

        // アイテムを選択
        const selectItem = (value, text) => {
            hiddenSelect.value = value;
            searchInput.value = text;
            hideDropdown();

            // カスタムイベントを発火（バリデーション等のため）
            const changeEvent = new Event('change', { bubbles: true });
            hiddenSelect.dispatchEvent(changeEvent);
        };

        // ハイライトを更新
        const updateHighlight = () => {
            dropdown.querySelectorAll('.searchable-select-item').forEach((item, index) => {
                item.classList.toggle('highlighted', index === highlightedIndex);
            });
        };

        // イベントリスナー
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            if (searchTerm === '') {
                hiddenSelect.value = '';
            }
            updateOptions();
            showDropdown();
            renderOptions(searchTerm);
            highlightedIndex = -1;
        });

        searchInput.addEventListener('focus', (e) => {
            updateOptions();
            setTimeout(() => {
                showDropdown();
            }, 10); // 少し遅延させて外部クリックイベントとの競合を避ける
        });

        searchInput.addEventListener('blur', (e) => {
            // ドロップダウン内をクリックした場合は閉じない
            setTimeout(() => {
                if (!wrapper.contains(document.activeElement)) {
                    hideDropdown();
                }
            }, 150);
        });

        searchInput.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.searchable-select-item:not(.searchable-select-no-results)');

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (dropdown.style.display === 'none') {
                        showDropdown();
                    }
                    highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
                    updateHighlight();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (dropdown.style.display === 'none') {
                        showDropdown();
                    }
                    highlightedIndex = Math.max(highlightedIndex - 1, 0);
                    updateHighlight();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && items[highlightedIndex]) {
                        const item = items[highlightedIndex];
                        selectItem(item.dataset.value, item.dataset.text);
                    }
                    break;
                case 'Escape':
                    hideDropdown();
                    searchInput.blur();
                    break;
            }
        });

        // クリックイベント
        dropdown.addEventListener('mousedown', (e) => {
            e.preventDefault(); // ブラーイベントを防ぐ
            const item = e.target.closest('.searchable-select-item');
            if (item && !item.classList.contains('searchable-select-no-results')) {
                selectItem(item.dataset.value, item.dataset.text);
            }
        });

        // 外部クリックで閉じる（改良版）
        document.addEventListener('mousedown', (e) => {
            if (!wrapper.contains(e.target)) {
                setTimeout(() => hideDropdown(), 10);
            }
        });

        // 矢印または入力フィールドクリック
        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('searchable-select-arrow')) {
                e.preventDefault();
                if (dropdown.style.display === 'block') {
                    hideDropdown();
                } else {
                    updateOptions();
                    showDropdown();
                    searchInput.focus();
                }
            }
        });

        // 入力フィールドクリック時の処理
        searchInput.addEventListener('click', (e) => {
            if (dropdown.style.display === 'none') {
                updateOptions();
                showDropdown();
            }
        });

        // this.searchableSelect として保存
        this.searchableSelect = {
            updateOptions,
            selectItem,
            clear: () => {
                hiddenSelect.value = '';
                searchInput.value = '';
                hideDropdown();
            },
            setValue: (value) => {
                updateOptions(); // オプションを最新に更新
                const option = allOptions.find(opt => opt.value === value.toString());

                if (option) {
                    selectItem(option.value, option.text);
                } else {
                    this.searchableSelect.clear();
                }
            }
        };

        // 初期化時にオプションを設定
        updateOptions();
    }

    initializeFilterSearchableSelect() {
        const searchInput = document.getElementById('client-filter-search');
        const dropdown = document.getElementById('client-filter-dropdown');
        const hiddenSelect = document.getElementById('client-filter');
        const wrapper = searchInput.parentElement;

        let highlightedIndex = -1;
        let allOptions = [];

        // オプションデータを準備（フィルター用）
        const updateOptions = () => {
            allOptions = [
                {
                    value: '',
                    text: '全て',
                    searchText: '全て',
                    normalizedText: normalizeText('全て')
                },
                {
                    value: '0',
                    text: 'その他業務',
                    searchText: 'その他業務',
                    normalizedText: normalizeText('その他業務')
                },
                ...this.clients.map(client => ({
                    value: client.id.toString(),
                    text: client.name,
                    searchText: client.name,
                    normalizedText: normalizeText(client.name)
                }))
            ];

            // 隠しselect要素にもoption要素を追加（フィルター用）
            const currentValue = hiddenSelect.value; // 現在の値を保持
            hiddenSelect.innerHTML = allOptions.map(option =>
                `<option value="${option.value}">${option.text}</option>`
            ).join('');
            hiddenSelect.value = currentValue; // 値を復元
        };

        // ドロップダウンを表示
        const showDropdown = () => {
            dropdown.style.display = 'block';
            wrapper.classList.add('open');
            renderOptions();
        };

        // ドロップダウンを非表示
        const hideDropdown = () => {
            dropdown.style.display = 'none';
            wrapper.classList.remove('open');
            highlightedIndex = -1;
        };

        // スマート検索機能（フィルター用）
        const smartSearch = (searchTerm, option) => {
            if (!searchTerm) return true;

            const normalizedSearchTerm = normalizeText(searchTerm);

            return (
                option.searchText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                option.normalizedText.includes(normalizedSearchTerm) ||
                option.normalizedText.startsWith(normalizedSearchTerm) ||
                option.normalizedText.split(/[\s\-_.()（）]/g).some(word =>
                    word.startsWith(normalizedSearchTerm)
                )
            );
        };

        // オプションをレンダリング（フィルター用）
        const renderOptions = (searchTerm = '') => {
            const filtered = allOptions.filter(option => smartSearch(searchTerm, option));

            if (searchTerm) {
                const normalizedSearchTerm = normalizeText(searchTerm);
                filtered.sort((a, b) => {
                    const aExact = a.normalizedText === normalizedSearchTerm;
                    const bExact = b.normalizedText === normalizedSearchTerm;
                    if (aExact !== bExact) return bExact - aExact;

                    const aStarts = a.normalizedText.startsWith(normalizedSearchTerm);
                    const bStarts = b.normalizedText.startsWith(normalizedSearchTerm);
                    if (aStarts !== bStarts) return bStarts - aStarts;

                    return a.text.length - b.text.length;
                });
            }

            if (filtered.length === 0) {
                dropdown.innerHTML = `<div class="searchable-select-no-results">「${searchTerm}」に該当する事業者が見つかりません</div>`;
                return;
            }

            dropdown.innerHTML = filtered.map((option, index) => {
                const isSelected = hiddenSelect.value === option.value;
                let displayText = option.text;

                if (searchTerm) {
                    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    displayText = option.text.replace(regex, '<mark style="background: #fff3cd; padding: 0;">$1</mark>');
                }

                return `<div class="searchable-select-item ${isSelected ? 'selected' : ''}" data-value="${option.value}" data-index="${index}" data-text="${option.text}">${displayText}</div>`;
            }).join('');

            const selectedItem = dropdown.querySelector('.searchable-select-item.selected');
            if (selectedItem) {
                highlightedIndex = parseInt(selectedItem.dataset.index);
                selectedItem.classList.add('highlighted');
            }
        };

        // アイテムを選択
        const selectItem = (value, text) => {
            hiddenSelect.value = value;
            searchInput.value = text;
            hideDropdown();

            // フィルター変更イベントを発火
            this.currentFilters.client = value;
            this.updateDisplay();
            this.saveFilterState(); // 状態を保存
        };

        // ハイライトを更新
        const updateHighlight = () => {
            dropdown.querySelectorAll('.searchable-select-item').forEach((item, index) => {
                item.classList.toggle('highlighted', index === highlightedIndex);
            });
        };

        // イベントリスナー
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            if (searchTerm === '') {
                hiddenSelect.value = '';
                this.currentFilters.client = '';
                this.updateDisplay();
            }
            updateOptions();
            showDropdown();
            renderOptions(searchTerm);
            highlightedIndex = -1;
        });

        searchInput.addEventListener('focus', (e) => {
            // 「全て」の場合はクリア
            if (searchInput.value === '全て') {
                searchInput.value = '';
            }
            updateOptions();
            setTimeout(() => {
                showDropdown();
            }, 10);
        });

        searchInput.addEventListener('blur', (e) => {
            setTimeout(() => {
                if (!wrapper.contains(document.activeElement)) {
                    hideDropdown();
                    // 空の場合は「全て」に戻す
                    if (searchInput.value.trim() === '') {
                        searchInput.value = '全て';
                        hiddenSelect.value = '';
                        this.currentFilters.client = '';
                        this.updateDisplay();
                        this.saveFilterState(); // 状態を保存
                    }
                }
            }, 150);
        });

        searchInput.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.searchable-select-item:not(.searchable-select-no-results)');

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (dropdown.style.display === 'none') {
                        showDropdown();
                    }
                    highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
                    updateHighlight();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (dropdown.style.display === 'none') {
                        showDropdown();
                    }
                    highlightedIndex = Math.max(highlightedIndex - 1, 0);
                    updateHighlight();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && items[highlightedIndex]) {
                        const item = items[highlightedIndex];
                        selectItem(item.dataset.value, item.dataset.text);
                    }
                    break;
                case 'Escape':
                    hideDropdown();
                    searchInput.blur();
                    break;
            }
        });

        dropdown.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.searchable-select-item');
            if (item && !item.classList.contains('searchable-select-no-results')) {
                selectItem(item.dataset.value, item.dataset.text);
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (!wrapper.contains(e.target)) {
                setTimeout(() => hideDropdown(), 10);
            }
        });

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('searchable-select-arrow')) {
                e.preventDefault();
                if (dropdown.style.display === 'block') {
                    hideDropdown();
                } else {
                    updateOptions();
                    showDropdown();
                    searchInput.focus();
                }
            }
        });

        searchInput.addEventListener('click', (e) => {
            // 「全て」の場合はクリア
            if (searchInput.value === '全て') {
                searchInput.value = '';
            }
            if (dropdown.style.display === 'none') {
                updateOptions();
                showDropdown();
            }
        });

        // 初期化
        updateOptions();

        // this.filterSearchableSelect として保存
        this.filterSearchableSelect = {
            updateOptions,
            selectItem,
            clear: () => {
                hiddenSelect.value = '';
                searchInput.value = '全て';
                hideDropdown();
                this.currentFilters.client = '';
                this.updateDisplay();
            },
            setValue: (value) => {
                const option = allOptions.find(opt => opt.value === value.toString());
                if (option) {
                    selectItem(option.value, option.text);
                } else {
                    this.filterSearchableSelect.clear();
                }
            }
        };

        // 初期値設定とオプション設定
        updateOptions();
        searchInput.value = '全て';
    }

    initializeTemplateClientSelect() {
        const searchInput = document.getElementById('template-client-search');
        const dropdown = document.getElementById('template-client-dropdown');
        const hiddenSelect = document.getElementById('template-client-select');

        if (!searchInput || !dropdown || !hiddenSelect) {
            console.warn('⚠️ テンプレート用事業者選択の要素が見つかりません');
            return;
        }

        const wrapper = searchInput.parentElement;
        let highlightedIndex = -1;
        let allOptions = [];

        // オプションデータを準備
        const updateOptions = () => {
            allOptions = [
                {
                    value: '',
                    text: '事業者を選択しない',
                    searchText: '事業者を選択しない',
                    normalizedText: normalizeText('事業者を選択しない')
                },
                ...this.clients.map(client => ({
                    value: client.id.toString(),
                    text: client.name,
                    searchText: client.name,
                    normalizedText: normalizeText(client.name)
                }))
            ];

            // 隠しselect要素を更新
            const currentValue = hiddenSelect.value;
            hiddenSelect.innerHTML = '<option value="">事業者を選択しない</option>' +
                this.clients.map(client =>
                    `<option value="${client.id}">${client.name}</option>`
                ).join('');
            hiddenSelect.value = currentValue;
        };

        // ドロップダウンを表示
        const showDropdown = () => {
            dropdown.style.display = 'block';
            wrapper.classList.add('open');
            renderOptions();
        };

        // ドロップダウンを非表示
        const hideDropdown = () => {
            dropdown.style.display = 'none';
            wrapper.classList.remove('open');
            highlightedIndex = -1;
        };

        // オプションをレンダリング
        const renderOptions = (searchTerm = '') => {
            const normalizedSearch = normalizeText(searchTerm);

            let filtered = allOptions.filter(option =>
                option.normalizedText.includes(normalizedSearch)
            );

            if (filtered.length === 0) {
                dropdown.innerHTML = `<div class="searchable-select-no-results">「${searchTerm}」に該当する事業者が見つかりません</div>`;
                return;
            }

            dropdown.innerHTML = filtered.map((option, index) => {
                const isSelected = hiddenSelect.value === option.value;
                return `<div class="searchable-select-item ${isSelected ? 'selected' : ''}" data-value="${option.value}" data-index="${index}" data-text="${option.text}">${option.text}</div>`;
            }).join('');

            const selectedItem = dropdown.querySelector('.searchable-select-item.selected');
            if (selectedItem) {
                highlightedIndex = parseInt(selectedItem.dataset.index);
                selectedItem.classList.add('highlighted');
            }
        };

        // アイテムを選択
        const selectItem = (value, text) => {
            hiddenSelect.value = value;
            searchInput.value = text;
            hideDropdown();
        };

        // ハイライトを更新
        const updateHighlight = () => {
            dropdown.querySelectorAll('.searchable-select-item').forEach((item, index) => {
                item.classList.toggle('highlighted', index === highlightedIndex);
            });
        };

        // イベントリスナー
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            if (searchTerm === '') {
                hiddenSelect.value = '';
            }
            updateOptions();
            showDropdown();
            renderOptions(searchTerm);
            highlightedIndex = -1;
        });

        searchInput.addEventListener('click', (e) => {
            if (dropdown.style.display === 'none') {
                updateOptions();
                showDropdown();
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.searchable-select-item:not(.searchable-select-no-results)');

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (dropdown.style.display === 'none') {
                        showDropdown();
                    }
                    highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
                    updateHighlight();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (dropdown.style.display === 'none') {
                        showDropdown();
                    }
                    highlightedIndex = Math.max(highlightedIndex - 1, 0);
                    updateHighlight();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && items[highlightedIndex]) {
                        const item = items[highlightedIndex];
                        selectItem(item.dataset.value, item.dataset.text);
                    }
                    break;
                case 'Escape':
                    hideDropdown();
                    break;
            }
        });

        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                hideDropdown();
            }, 200);
        });

        dropdown.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.searchable-select-item');
            if (item && !item.classList.contains('searchable-select-no-results')) {
                selectItem(item.dataset.value, item.dataset.text);
            }
        });

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('searchable-select-arrow')) {
                e.preventDefault();
                if (dropdown.style.display === 'block') {
                    hideDropdown();
                } else {
                    updateOptions();
                    showDropdown();
                }
            }
        });

        // 初期化
        updateOptions();

        // this.templateClientSelect として保存
        this.templateClientSelect = {
            updateOptions,
            selectItem,
            clear: () => {
                searchInput.value = '';
                hiddenSelect.value = '';
                hideDropdown();
            }
        };
    }

    initializeAssigneeSidebar() {
        // フィルター状態を復元（または初期値設定）
        const savedState = this.loadFilterState();
        if (savedState) {
            this.currentAssigneeFilter = savedState.assigneeFilter;
            this.currentFilters = { ...this.currentFilters, ...savedState.filters };
            this.currentDisplay = savedState.display || 'list';
            console.log('Filter state restored:', savedState);
        } else {
            this.currentAssigneeFilter = null; // 全担当者を表示
            console.log('Using default filter state');
        }

        this.renderAssigneeSidebar();

        // フィルター状態が復元された場合はUIも更新
        if (savedState) {
            this.updateFilterUI();
            // タイトルも更新
            this.updateTaskPanelTitle();

            // 表示形式も復元（ボタンのactive状態とビューの表示を同期）
            if (savedState.display) {
                // ボタンのactive状態を更新
                document.querySelectorAll('.display-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.dataset.display === savedState.display) {
                        btn.classList.add('active');
                    }
                });

                // ビューの表示を切り替え
                document.querySelectorAll('.task-view').forEach(view => {
                    view.style.display = 'none';
                });
                const targetView = document.getElementById(`${savedState.display}-view`);
                if (targetView) {
                    targetView.style.display = 'block';
                }
            }
        }
    }

    // フィルター状態をローカルストレージに保存
    saveFilterState() {
        const filterState = {
            assigneeFilter: this.currentAssigneeFilter,
            filters: {
                status: this.currentFilters.status,
                client: this.currentFilters.client,
                search: this.currentFilters.search
            },
            display: this.currentDisplay,
            timestamp: Date.now()
        };
        localStorage.setItem('taskManagement_filters', JSON.stringify(filterState));
    }

    // フィルター状態をローカルストレージから復元
    loadFilterState() {
        try {
            const saved = localStorage.getItem('taskManagement_filters');
            if (saved) {
                const state = JSON.parse(saved);
                // 24時間以内の状態のみ復元
                if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
                    return state;
                }
                // 期限切れの場合は削除
                localStorage.removeItem('taskManagement_filters');
            }
        } catch (error) {
            console.error('Filter state loading error:', error);
            localStorage.removeItem('taskManagement_filters');
        }
        return null;
    }

    // フィルターを初期状態にリセット
    resetFilters() {
        this.currentAssigneeFilter = null;
        this.currentFilters = {
            status: '',
            client: '',
            search: ''
        };
        this.currentDisplay = 'list';
        this.currentSort = { field: 'default_priority', direction: 'asc' };

        // UIを更新
        this.renderAssigneeSidebar();
        this.updateFilterUI();
        this.updateDisplay();

        // ローカルストレージをクリア
        localStorage.removeItem('taskManagement_filters');

        showToast('フィルターをリセットしました', 'success');
    }

    // フィルターUIの状態を更新
    updateFilterUI() {
        // ステータスフィルター
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) statusFilter.value = this.currentFilters.status;

        // 検索フィールド
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = this.currentFilters.search;

        // 事業者フィルター（検索可能プルダウン）
        if (this.filterSearchableSelect) {
            this.filterSearchableSelect.setValue(this.currentFilters.client);
        }

        // 表示形式ボタン
        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.display === this.currentDisplay);
        });
    }

    renderAssigneeSidebar() {
        const sidebar = document.getElementById('assignee-sidebar');
        if (!sidebar) return;

        // 全体ボタン + スタッフごとのボタンを生成
        const allStaffs = [
            { id: null, name: '全担当者', initial: '全' },
            ...this.staffs.sort((a, b) => a.id - b.id) // ID順でソート
        ];

        const buttons = allStaffs.map(staff => {
            const taskCount = this.getTaskCountForAssignee(staff.id);
            const hasUrgentTasks = this.hasUrgentTasksForAssignee(staff.id);
            const hasOverdueTasks = this.hasOverdueTasksForAssignee(staff.id);
            const isActive = this.currentAssigneeFilter === staff.id;

            return `
                <button class="assignee-btn ${isActive ? 'active' : ''}"
                        data-assignee-id="${staff.id || ''}"
                        onclick="taskManager.filterByAssignee(${staff.id})">
                    <span class="initial">${staff.initial || staff.name.charAt(0)}</span>
                    <span class="full-name">${staff.name}</span>
                    <span class="task-badge ${hasUrgentTasks ? 'urgent' : ''} ${taskCount === 0 ? 'zero' : ''}">${hasOverdueTasks ? '⚠️' + taskCount : taskCount}</span>
                </button>
            `;
        }).join('');

        sidebar.innerHTML = buttons;
    }

    getTaskCountForAssignee(assigneeId) {
        // 「依頼中」タスクの数のみを計算
        return this.tasks.filter(task => {
            if (assigneeId === null) {
                // 全担当者の場合は全ての「依頼中」タスク
                return task.status === '依頼中';
            } else {
                // 特定担当者の「依頼中」タスク
                return task.assignee_id === assigneeId && task.status === '依頼中';
            }
        }).length;
    }

    hasUrgentTasksForAssignee(assigneeId) {
        // 「依頼中」タスクで期限切れまたは期限間近があるかチェック
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return this.tasks.some(task => {
            if (assigneeId !== null && task.assignee_id !== assigneeId) return false;
            if (task.status !== '依頼中') return false; // 「依頼中」のみ赤色対象

            // 期限切れ・期限間近チェック
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                return dueDate <= tomorrow;
            }

            return false;
        });
    }

    hasOverdueTasksForAssignee(assigneeId) {
        // 「依頼中」タスクで期限切れがあるかチェック
        const today = new Date();

        return this.tasks.some(task => {
            if (assigneeId !== null && task.assignee_id !== assigneeId) return false;
            if (task.status !== '依頼中') return false; // 「依頼中」のみ対象

            // 期限切れチェック
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                return diffDays < 0;
            }

            return false;
        });
    }

    filterByAssignee(assigneeId) {
        this.currentAssigneeFilter = assigneeId;
        this.renderAssigneeSidebar(); // ボタンの状態を更新
        this.updateTaskPanelTitle(); // タイトルを更新
        this.updateDisplay(); // タスク表示を更新
        this.saveFilterState(); // 状態を保存
    }

    updateTaskPanelTitle() {
        const titleElement = document.querySelector('.panel-header h3');
        if (!titleElement) return;

        let titleText = '📋 全体タスク管理';

        // 履歴モードの場合
        if (this.historyMode) {
            titleText = '📋 履歴タスク管理';
        } else if (this.currentAssigneeFilter !== null) {
            // 特定の担当者でフィルタリング中
            const assignee = this.staffs.find(staff => staff.id === this.currentAssigneeFilter);
            if (assignee) {
                titleText = `📋 ${assignee.name} 受任タスク一覧`;
            }
        }

        // タスク件数部分を保持しつつタイトルを更新
        const taskCountSpan = titleElement.querySelector('#total-task-count');
        const taskCountHTML = taskCountSpan ? taskCountSpan.outerHTML : '';

        titleElement.innerHTML = `${titleText} ${taskCountHTML}`;
    }

    switchDisplay(displayType) {
        // 全ての表示を非表示
        document.querySelectorAll('.task-view').forEach(view => {
            view.style.display = 'none';
        });

        // 選択した表示を表示
        const targetView = document.getElementById(`${displayType}-view`);
        if (targetView) {
            targetView.style.display = 'block';
        }

        this.updateDisplay();
        this.saveFilterState(); // 状態を保存
    }

    updateDisplay() {
        // 履歴モードの場合は履歴表示を使用
        if (this.historyMode) {
            this.updateHistoryDisplay();
            return;
        }

        const filteredTasks = this.getFilteredTasks();

        // タスク数カウント更新（依頼中のタスクのみ）
        const pendingTasks = filteredTasks.filter(task => task.status === '依頼中');
        document.getElementById('total-task-count').textContent = `${pendingTasks.length}件`;

        // マイタスクパネルの更新
        this.updateMyTasks();

        if (this.currentDisplay === 'list') {
            this.updateListView(filteredTasks);
        } else if (this.currentDisplay === 'card') {
            this.updateCardView(filteredTasks);
        } else if (this.currentDisplay === 'calendar') {
            this.updateCalendarView(filteredTasks);
        }
    }

    getFilteredTasks() {
        let filtered = [...this.tasks];

        // 履歴モードでない場合は時間ベースの非表示処理を適用
        if (!this.historyMode) {
            filtered = this.applyTimeBasedVisibility(filtered);
        }

        // 担当者サイドバーフィルター（最優先）
        if (this.currentAssigneeFilter !== null) {
            filtered = filtered.filter(task => task.assignee_id === this.currentAssigneeFilter);
        }

        // ステータスフィルター
        if (this.currentFilters.status) {
            filtered = filtered.filter(task => task.status === this.currentFilters.status);
        }

        // 事業者フィルター
        if (this.currentFilters.client) {
            filtered = filtered.filter(task => task.client_id == this.currentFilters.client);
        }

        // 検索フィルター（正規化対応）
        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            const normalizedSearch = normalizeText(this.currentFilters.search);

            filtered = filtered.filter(task => {
                const clientName = (task.client_id === 0 || task.client_id === null) ? 'その他業務' : (task.clients?.name || '');

                // 従来の検索
                const basicMatch = task.task_name.toLowerCase().includes(search) ||
                                   clientName.toLowerCase().includes(search) ||
                                   (task.description || '').toLowerCase().includes(search);

                // 正規化検索（全角半角、ひらがなカタカナ対応）
                const normalizedMatch = normalizeText(task.task_name).includes(normalizedSearch) ||
                                        normalizeText(clientName).includes(normalizedSearch) ||
                                        normalizeText(task.description || '').includes(normalizedSearch);

                return basicMatch || normalizedMatch;
            });
        }

        // ソート（4段階優先度システム）
        filtered.sort((a, b) => {
            // ユーザーがクリックした列でのソートが指定されている場合
            if (this.currentSort.field !== 'default_priority') {
                const field = this.currentSort.field;
                let aVal = a[field];
                let bVal = b[field];

                // 特別な処理が必要なフィールド
                if (field === 'client_name') {
                    aVal = (a.client_id === 0 || a.client_id === null) ? 'その他業務' : (a.clients?.name || '');
                    bVal = (b.client_id === 0 || b.client_id === null) ? 'その他業務' : (b.clients?.name || '');
                } else if (field === 'assignee_name') {
                    aVal = a.assignee?.name || '';
                    bVal = b.assignee?.name || '';
                } else if (field === 'requester_name') {
                    aVal = a.requester?.name || '';
                    bVal = b.requester?.name || '';
                }

                if (aVal === null || aVal === undefined) aVal = '';
                if (bVal === null || bVal === undefined) bVal = '';

                const result = aVal > bVal ? 1 : -1;
                return this.currentSort.direction === 'asc' ? result : -result;
            }

            // デフォルト4段階ソート
            return this.getTaskPriorityScore(a) - this.getTaskPriorityScore(b);
        });

        return filtered;
    }

    // タスクの優先度スコアを計算（低いスコア = 高い優先度）
    getTaskPriorityScore(task) {
        let score = 0;

        // 1位: ステータス順（依頼中 → 確認待ち → 確認完了）
        const statusPriority = {
            '依頼中': 1000000,
            '作業完了': 2000000,
            '確認完了': 3000000
        };
        score = statusPriority[task.status] || 4000000;

        // 2位: 期限切れタスク（「依頼中」のみ適用）
        if (task.status === '依頼中' && task.due_date) {
            const today = new Date();
            const due = new Date(task.due_date);
            const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                // 期限切れの「依頼中」タスクは最優先
                score = 0 + Math.abs(diffDays); // 0-999の範囲で最優先
                return score;
            }
        }

        // 3位: 期限日（近い順）
        if (task.due_date) {
            const today = new Date();
            const due = new Date(task.due_date);
            const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
            score += Math.max(0, diffDays);
        } else {
            score += 999999; // 期限なしは各ステータス内で最後
        }

        // 4位: 重要度（高い順）
        const priorityValue = task.priority || 1;
        score += (4 - priorityValue) * 0.1; // 重要度3=0.1, 重要度2=0.2, 重要度1=0.3

        return score;
    }

    // マイタスク専用ソートメソッド
    sortMyAssignedTasks(a, b) {
        // 受任中のタスク: 依頼中 → 確認待ち の順
        const statusPriority = {
            '依頼中': 1,
            '作業完了': 2
        };

        const aPriority = statusPriority[a.status] || 999;
        const bPriority = statusPriority[b.status] || 999;

        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }

        // 同ステータスなら期限日順（近い順）
        return this.compareDueDates(a, b);
    }

    sortMyRequestedTasks(a, b) {
        // 依頼中のタスク: 確認待ち → 依頼中 の順（確認作業優先）
        const statusPriority = {
            '作業完了': 1,  // 確認待ち
            '依頼中': 2
        };

        const aPriority = statusPriority[a.status] || 999;
        const bPriority = statusPriority[b.status] || 999;

        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }

        // 同ステータスなら期限日順（近い順）
        return this.compareDueDates(a, b);
    }

    compareDueDates(a, b) {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;

        const dateA = new Date(a.due_date);
        const dateB = new Date(b.due_date);
        return dateA - dateB;
    }

    // スマート通知システム関連メソッド
    startSmartNotificationSystem() {
        // 関係者のみ通常の定期チェック（120秒間隔）
        if (this.isRelevantUser()) {
            this.startAutoRefresh(120000); // 120秒間隔
        }
    }

    startAutoRefresh(intervalMs = 120000) {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        this.autoRefreshInterval = setInterval(async () => {
            try {
                await this.refreshTasks();
            } catch (error) {
                console.error('Auto refresh error:', error);
            }
        }, intervalMs);

        console.log(`Auto refresh started: ${intervalMs/1000}秒間隔`);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('Auto refresh stopped');
        }
    }

    async refreshTasks() {
        // ユーザー操作中またはモーダル表示中はスキップ
        if (this.isUserInteracting || this.isModalOpen()) {
            console.log('Auto refresh skipped: user is interacting');
            return;
        }

        const oldTaskCount = this.tasks.length;
        await this.loadTasks();
        const newTaskCount = this.tasks.length;

        // タスク数が変更された場合に通知
        if (newTaskCount !== oldTaskCount) {
            showToast(`タスクが更新されました (${newTaskCount}件)`, 'info');
        }

        this.lastUpdateTime = new Date();
        console.log('Tasks refreshed at:', this.lastUpdateTime.toLocaleTimeString());

        // 新規タスクや変更の検知
        this.detectTaskChanges();
    }

    // 関係者かどうかを判定
    isRelevantUser() {
        if (!this.currentUser || !this.tasks.length) return false;

        return this.tasks.some(task =>
            task.assignee_id === this.currentUser.id ||
            task.requester_id === this.currentUser.id
        );
    }

    // タスク変更の検知と通知
    detectTaskChanges() {
        const currentTaskCount = this.tasks.length;

        if (this.lastTaskCount > 0 && currentTaskCount > this.lastTaskCount) {
            // 新規タスクの検知
            const newTasks = this.tasks.slice(this.lastTaskCount);
            this.handleNewTasks(newTasks);
        }

        this.lastTaskCount = currentTaskCount;
    }

    // 新規タスクの処理
    handleNewTasks(newTasks) {
        newTasks.forEach(task => {
            if (this.isTaskRelevantToUser(task)) {
                const notificationKey = `new_task_${task.id}`;
                this.scheduleSmartNotification(notificationKey, {
                    type: 'new_task',
                    task: task,
                    message: this.createNewTaskMessage(task)
                });
            }
        });
    }

    // タスクがユーザーに関係するかチェック
    isTaskRelevantToUser(task) {
        if (!this.currentUser) return false;
        return task.assignee_id === this.currentUser.id ||
               task.requester_id === this.currentUser.id;
    }

    // 新規タスクメッセージ作成
    createNewTaskMessage(task) {
        // sessionStorageから選択された担当者名を取得、なければDB名を使用
        const selectedStaffName = sessionStorage.getItem('selected-staff-name');
        const requesterName = selectedStaffName || task.requester?.name || '不明';
        const taskName = task.task_name || 'タスク';

        if (task.assignee_id === this.currentUser.id) {
            return `${requesterName}さんから新規タスク「${taskName}」の依頼が届きました`;
        } else {
            return `タスク「${taskName}」が更新されました`;
        }
    }

    // スマート通知のスケジュール
    scheduleSmartNotification(key, notificationData) {
        if (this.pendingNotifications.has(key)) return;

        this.pendingNotifications.set(key, {
            ...notificationData,
            attempts: 0,
            maxAttempts: 5
        });

        this.startSmartNotificationAttempts(key);
    }

    // 5秒間隔での通知試行
    startSmartNotificationAttempts(key) {
        const attemptNotification = () => {
            const notification = this.pendingNotifications.get(key);
            if (!notification) return;

            try {
                showToast(notification.message, 'info');
                console.log(`Smart notification delivered: ${notification.message}`);

                // 通知成功 - 削除
                this.pendingNotifications.delete(key);

            } catch (error) {
                console.error('Notification failed:', error);
                notification.attempts++;

                if (notification.attempts >= notification.maxAttempts) {
                    console.log(`Notification max attempts reached for: ${key}`);
                    this.pendingNotifications.delete(key);
                } else {
                    // 5秒後に再試行
                    setTimeout(attemptNotification, 5000);
                }
            }
        };

        // 即座に1回目の試行
        attemptNotification();
    }

    // モーダルが開いているかチェック
    isModalOpen() {
        const modals = document.querySelectorAll('.modal');
        return Array.from(modals).some(modal => modal.style.display !== 'none' && modal.style.display !== '');
    }

    // ユーザー操作開始
    setUserInteracting(isInteracting) {
        this.isUserInteracting = isInteracting;
        if (isInteracting) {
            console.log('User interaction started - auto refresh paused');
        } else {
            console.log('User interaction ended - auto refresh resumed');
        }
    }

    updateListView(tasks) {
        const tbody = document.getElementById('tasks-tbody');
        tbody.innerHTML = '';

        tasks.forEach(task => {
            const row = this.createTaskRow(task);
            tbody.appendChild(row);
        });
    }

    createTaskRow(task) {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        // 重要度表示
        const priorityStars = this.getPriorityDisplay(task.priority);

        // 期限の色分け
        const dueDateClass = this.getDueDateClass(task.due_date);
        const dueDateText = this.formatDueDateWithWarning(task.due_date, task.is_anytime, task.status);
        const workDateText = task.work_date ? this.formatMonthDay(task.work_date) : '-';
        const createdDateText = task.created_at ? this.formatMonthDay(task.created_at) : '-';

        // ステータスバッジ（クリック可能）
        const statusBadge = this.createClickableStatusBadge(task);

        // 短縮表示のヘルパー関数
        const truncate = (text, maxLength) => {
            if (!text) return '-';
            return text.length > maxLength ? text.substring(0, maxLength) + '…' : text;
        };

        // 参照URLアイコン
        const urlIcon = task.reference_url ?
            `<a href="${task.reference_url}" target="_blank" title="${task.reference_url}" onclick="event.stopPropagation()">🔗</a>` : '-';

        // 想定時間表示（4h, 5.5hの形式）
        const timeHours = task.estimated_time_hours ?
            `${task.estimated_time_hours}h` : '-';

        // 事業者名（クリック可能）- 最低8文字表示
        const clientName = (task.client_id === 0 || task.client_id === null) ? 'その他業務' :
            task.clients?.name ?
            `<a href="../../details.html?id=${task.client_id}" title="${task.clients.name}" onclick="event.stopPropagation()" style="color: #007bff; text-decoration: none;">${truncate(task.clients.name, 15)}</a>` : '-';

        tr.innerHTML = `
            <td style="text-align: center; padding: 4px 6px;" title="${this.getPriorityText(task.priority)}">${priorityStars}</td>
            <td style="padding: 4px 6px; min-width: 8em;" title="${(task.client_id === 0 || task.client_id === null) ? 'その他業務' : (task.clients?.name || '')}">${clientName}</td>
            <td style="padding: 4px 6px; min-width: 10em;" title="${task.task_name || ''}">${truncate(task.task_name, 15)}</td>
            <td style="padding: 4px 6px; text-align: center; min-width: 8em;" title="${task.description || ''}">${truncate(task.description, 20)}</td>
            <td style="text-align: center; padding: 4px 6px; font-size: 0.85rem;">${timeHours}</td>
            <td style="text-align: center; padding: 4px 6px;">${urlIcon}</td>
            <td style="padding: 4px 6px;" title="${task.requester?.name || ''}">${truncate(task.requester?.name, 8)}</td>
            <td style="padding: 4px 6px;" title="${task.assignee?.name || ''}">${truncate(task.assignee?.name, 8)}</td>
            <td style="padding: 4px 6px;" title="${createdDateText}">${createdDateText}</td>
            <td style="padding: 4px 6px;" title="${dueDateText}"><span class="due-date ${dueDateClass}">${dueDateText}</span></td>
            <td style="padding: 4px 6px;" title="${workDateText}">${workDateText}</td>
            <td style="padding: 4px 6px;">${statusBadge}</td>
        `;

        // 完了済みタスクにグレーアウトクラスを追加
        if (task.status === '確認完了') {
            tr.classList.add('task-completed');
        }

        // 行クリックで直接編集モード表示
        tr.addEventListener('click', (e) => {
            // ステータスバッジやリンククリック時は無視
            if (e.target.closest('.status-badge') || e.target.closest('a')) {
                return;
            }
            this.openTaskInEditMode(task.id);
        });

        return tr;
    }

    getPriorityDisplay(priority) {
        switch(priority) {
            case 3: return '⭐⭐⭐';
            case 2: return '⭐⭐';
            case 1: return '⭐';
            default: return '⭐⭐';
        }
    }

    getPriorityText(priority) {
        switch(priority) {
            case 3: return '高重要度';
            case 2: return '中重要度';
            case 1: return '低重要度';
            default: return '中重要度';
        }
    }

    createClickableStatusBadge(task) {
        const statusConfig = {
            '依頼中': { class: 'status-pending', text: '📝 依頼中', next: '作業完了' },
            '作業完了': { class: 'status-working', text: '✅ 確認待ち', next: '確認完了' },
            '確認完了': { class: 'status-completed', text: '☑️ 確認完了', next: '依頼中' }
        };

        const config = statusConfig[task.status] || statusConfig['依頼中'];
        return `<span class="status-badge ${config.class}" style="cursor: pointer; font-size: 11px"
                      title="クリックで「${config.next}」に変更"
                      onclick="event.stopPropagation(); taskManager.cycleTaskStatus(${task.id})">${config.text}</span>`;
    }

    createStatusBadge(status) {
        const statusConfig = {
            '依頼中': { class: 'status-pending', text: '📝 依頼中' },
            '作業完了': { class: 'status-working', text: '✅ 確認待ち' },
            '確認完了': { class: 'status-completed', text: '☑️ 確認完了' }
        };

        const config = statusConfig[status] || { class: 'status-pending', text: status };
        return `<span class="status-badge ${config.class}">${config.text}</span>`;
    }

    createActionButtons(task) {
        let buttons = [];

        // ステータスに応じたボタン（委任者は全て操作可能）
        // 随時タスクの場合：依頼中 ⇔ 確認待ち のループ
        if (task.is_anytime) {
            if (task.status === '依頼中') {
                if (task.assignee_id === this.currentUser.id || task.requester_id === this.currentUser.id) {
                    buttons.push(`<button class="btn btn-sm btn-complete" onclick="taskManager.updateTaskStatus(${task.id}, '作業完了')">確認待ち</button>`);
                }
            } else if (task.status === '作業完了') {
                if (task.requester_id === this.currentUser.id) {
                    buttons.push(`<button class="btn btn-sm btn-cancel-complete" onclick="taskManager.updateTaskStatus(${task.id}, '依頼中')">依頼中に戻す</button>`);
                }
            }
        } else {
            // 通常タスクの場合：依頼中 → 確認待ち → 確認完了 → 依頼中
            if (task.status === '依頼中') {
                if (task.assignee_id === this.currentUser.id || task.requester_id === this.currentUser.id) {
                    buttons.push(`<button class="btn btn-sm btn-complete" onclick="taskManager.updateTaskStatus(${task.id}, '作業完了')">確認待ち</button>`);
                }
            } else if (task.status === '作業完了') {
                if (task.requester_id === this.currentUser.id) {
                    buttons.push(`<button class="btn btn-sm btn-confirm" onclick="taskManager.updateTaskStatus(${task.id}, '確認完了')">確認完了</button>`);
                }
            } else if (task.status === '確認完了') {
                if (task.requester_id === this.currentUser.id) {
                    buttons.push(`<button class="btn btn-sm btn-cancel-complete" onclick="taskManager.updateTaskStatus(${task.id}, '依頼中')">完了取消</button>`);
                }
            }
        }

        return `<div class="action-buttons">${buttons.join('')}</div>`;
    }

    formatMonthDay(dateString) {
        if (!dateString) return '-';

        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const day = date.getDate();

        return `${month}/${day}`;
    }

    formatDueDateWithWarning(dueDate, isAnytime = false, status = null) {
        if (isAnytime) return '【随時】';
        if (!dueDate) return '-';

        const today = new Date();
        const due = new Date(dueDate);
        const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        const formattedDate = this.formatMonthDay(dueDate);

        // 期限切れかつステータスが「依頼中」の場合のみ警告表示
        if (diffDays < 0 && status === '依頼中') {
            return `⚠️${formattedDate}`;
        }

        return formattedDate;
    }

    getDueDateClass(dueDate) {
        if (!dueDate) return '';

        const today = new Date();
        const due = new Date(dueDate);
        const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'due-overdue';
        if (diffDays === 0) return 'due-today';
        if (diffDays <= 3) return 'due-soon';
        return '';
    }

    updateCardView(tasks) {
        // カンバンボードの各列をクリア
        ['tasks-pending', 'tasks-working', 'tasks-completed'].forEach(id => {
            document.getElementById(id).innerHTML = '';
        });

        // ステータス別に分類
        const tasksByStatus = {
            '依頼中': [],
            '作業完了': [],
            '確認完了': []
        };

        tasks.forEach(task => {
            const status = task.status || '依頼中';
            if (tasksByStatus[status]) {
                tasksByStatus[status].push(task);
            }
        });

        // カンバン列のヘッダーにタスク数を表示
        const statusLabels = {
            '依頼中': '📝 依頼中',
            '作業完了': '✅ 確認待ち',
            '確認完了': '☑️ 確認完了'
        };

        // 各列にタスクカードを追加
        Object.entries(tasksByStatus).forEach(([status, statusTasks]) => {
            const containerId = status === '依頼中' ? 'tasks-pending' :
                               status === '作業完了' ? 'tasks-working' : 'tasks-completed';

            const container = document.getElementById(containerId);
            const column = container.parentElement;
            const header = column.querySelector('h3');

            // ヘッダーにタスク数を表示
            if (header) {
                header.innerHTML = `${statusLabels[status]} <span style="background: #007bff; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 8px;">${statusTasks.length}</span>`;
            }

            // タスクカードを追加
            statusTasks.forEach(task => {
                const card = this.createTaskCard(task);
                container.appendChild(card);
            });

            // 10件以上の場合は「もっと見る」機能を追加
            if (statusTasks.length > 10) {
                this.addShowMoreButton(container, statusTasks.slice(10), status);
            }
        });

        // ドラッグ&ドロップ初期化
        setTimeout(() => {
            this.initializeKanbanSortable();
        }, 100); // DOM更新後に初期化
    }

    addShowMoreButton(container, hiddenTasks, status) {
        // 最初は10件まで表示
        const visibleTasks = Array.from(container.children).slice(0, 10);
        const hiddenTaskElements = Array.from(container.children).slice(10);

        // 隠すタスクを非表示に
        hiddenTaskElements.forEach(card => {
            card.style.display = 'none';
        });

        // 「もっと見る」ボタン追加
        const showMoreBtn = document.createElement('div');
        showMoreBtn.className = 'show-more-btn';
        showMoreBtn.style.cssText = `
            text-align: center;
            padding: 8px;
            background: #f8f9fa;
            border: 1px dashed #007bff;
            border-radius: 4px;
            color: #007bff;
            cursor: pointer;
            font-size: 0.8rem;
            margin-top: 4px;
        `;
        showMoreBtn.innerHTML = `▼ さらに${hiddenTasks.length}件を表示`;

        let isExpanded = false;
        showMoreBtn.addEventListener('click', () => {
            if (!isExpanded) {
                // 展開
                hiddenTaskElements.forEach(card => {
                    card.style.display = 'flex';
                });
                showMoreBtn.innerHTML = `▲ 折りたたみ`;
                isExpanded = true;
            } else {
                // 折りたたみ
                hiddenTaskElements.forEach(card => {
                    card.style.display = 'none';
                });
                showMoreBtn.innerHTML = `▼ さらに${hiddenTasks.length}件を表示`;
                isExpanded = false;
            }
        });

        container.appendChild(showMoreBtn);
    }

    createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.taskId = task.id;

        // 確認完了タスクの場合はグレーアウト
        const isCompleted = task.status === '確認完了';
        if (isCompleted) {
            card.classList.add('task-completed-gray');
        }

        const dueDateText = this.formatDueDateWithWarning(task.due_date, task.is_anytime, task.status);
        const workDateText = task.work_date ? this.formatMonthDay(task.work_date) : '-';
        const dueDateClass = this.getDueDateClass(task.due_date);

        // 2行レイアウト用のデータ準備（マイタスクと同じ方式）
        const priorityStars = this.getPriorityDisplay(task.priority);
        const truncatedDescription = task.description ?
            (task.description.length > 12 ? task.description.substring(0, 12) + '…' : task.description) : '-';

        // 事業者リンク（省略なし、完了済みの場合は通常テキスト）
        const clientLink = (task.client_id === 0 || task.client_id === null) ?
            `<span style="color: ${isCompleted ? '#6c757d' : '#495057'}; font-size: 15px;">その他業務</span>` :
            task.clients?.name ?
            (isCompleted ?
                `<span style="color: #6c757d; font-size: 15px;">${task.clients.name}</span>` :
                `<a href="../../details.html?id=${task.client_id}" title="${task.clients.name}" onclick="event.stopPropagation()" style="color: #007bff; text-decoration: none; font-size: 12px;">${task.clients.name}</a>`
            ) : '-';

        // 参照URLアイコン（完了済みの場合はグレー）
        const urlIcon = task.reference_url ?
            (isCompleted ?
                `<span style="font-size: 0.8rem; color: #adb5bd;">🔗</span>` :
                `<a href="${task.reference_url}" target="_blank" title="${task.reference_url}" onclick="event.stopPropagation()" style="font-size: 0.8rem;">🔗</a>`
            ) : '-';

        // 委任者/受任者の表示
        const requesterName = task.requester?.name ?
            (task.requester.name.length > 6 ? task.requester.name.substring(0, 6) + '…' : task.requester.name) : '-';
        const assigneeName = task.assignee?.name ?
            (task.assignee.name.length > 6 ? task.assignee.name.substring(0, 6) + '…' : task.assignee.name) : '-';

        // 日付表示
        const dueDateDisplay = dueDateText !== '-' ? `期限：${dueDateText}` : '期限：-';
        const workDateDisplay = workDateText !== '-' ? `予定：${workDateText}` : '予定：-';

        // 完了済みの場合の色調整
        const textColor = isCompleted ? '#6c757d' : '#495057';
        const linkColor = isCompleted ? '#6c757d' : (dueDateClass ? '#dc3545' : '#495057');

        card.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 3px; padding: 0.4em; width: 100%; min-width: 0;">
                <!-- 上段：事業者名とタスク名を最大限活用 -->
                <div style="display: flex; align-items: center; gap: 0.5em; width: 100%; min-width: 0;">
                    <span style="font-size: clamp(12px, 0.9em, 12px); flex: 0 0 auto; white-space: nowrap; min-width: 15em; max-width: 15em; overflow: hidden; text-overflow: ellipsis;" title="${(task.client_id === 0 || task.client_id === null) ? 'その他業務' : (task.clients?.name || '')}">${clientLink}</span>
                    <span style="font-size: clamp(11px, 0.8em, 12px); font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${textColor};" title="${task.task_name || 'Untitled Task'}">${task.task_name || 'Untitled Task'}</span>
                    <span style="font-size: clamp(9px, 0.7em, 11px); flex: 0 0 auto; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 12em;" title="${task.description || ''}">${truncatedDescription}</span>
                </div>
                <!-- 下段：重要度+詳細情報 -->
                <div style="display: flex; align-items: center; gap: 0.3em; font-size: clamp(9px, 0.7em, 11px); color: ${textColor}; width: 100%; min-width: 0;">
                    <span style="flex: 0 0 auto; color: ${textColor};" title="${this.getPriorityText(task.priority)}">${priorityStars}</span>
                    <span style="flex: 0 0 auto; text-align: center;">${urlIcon}</span>
                    <span style="flex: 1; overflow: hidden; font-size: clamp(10px, 0.75em, 13px); text-overflow: ellipsis; white-space: nowrap; min-width: 3em;" title="${task.requester?.name || ''}">依頼：${requesterName}</span>
                    <span style="flex: 1; overflow: hidden; font-size: clamp(10px, 0.75em, 13px); text-overflow: ellipsis; white-space: nowrap; min-width: 3em;" title="${task.assignee?.name || ''}">受任：${assigneeName}</span>
                    <span style="flex: 0 0 auto; font-size: clamp(10px, 0.75em, 13px); color: ${linkColor}; white-space: nowrap; min-width: 4em;" title="${task.due_date || ''}">${dueDateDisplay}</span>
                    <span style="flex: 0 0 auto; font-size: clamp(10px, 0.75em, 13px); white-space: nowrap; min-width: 4em;" title="${task.work_date || ''}">${workDateDisplay}</span>
                </div>
            </div>
        `;

        // クリックで直接編集モード表示
        card.addEventListener('click', () => {
            this.openTaskInEditMode(task.id);
        });

        return card;
    }

    initializeKanbanSortable() {
        // SortableJSを使用したドラッグ&ドロップ
        const kanbanColumns = document.querySelectorAll('.kanban-tasks');

        kanbanColumns.forEach(column => {
            new Sortable(column, {
                group: 'kanban',
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                onStart: (evt) => {
                    // ドラッグ開始時：全ドロップエリアをハイライト
                    document.querySelectorAll('.kanban-tasks').forEach(col => {
                        if (col !== evt.from) {
                            col.classList.add('sortable-drag-over');
                        }
                    });
                },
                onEnd: async (evt) => {
                    // ドラッグ終了時：ハイライト解除
                    document.querySelectorAll('.kanban-tasks').forEach(col => {
                        col.classList.remove('sortable-drag-over');
                    });

                    const taskId = parseInt(evt.item.dataset.taskId);

                    // ドロップ先のステータスを取得（複数の方法で試す）
                    let newStatus = evt.to.dataset.status || evt.to.parentElement?.dataset.status;
                    if (!newStatus) {
                        const kanbanColumn = evt.to.closest('[data-status]');
                        newStatus = kanbanColumn?.dataset.status;
                    }

                    // 元の位置と同じ場合は何もしない
                    if (evt.from === evt.to) {
                        return;
                    }

                    console.log(`Moving task ${taskId} to status: ${newStatus}`);

                    try {
                        // タスク情報を取得
                        const task = this.tasks.find(t => t.id === taskId);

                        console.log('📋 Task info:', { id: taskId, is_anytime: task?.is_anytime, newStatus, work_date: task?.work_date });

                        // 随時タスクを確認完了にドロップした場合は禁止
                        if (task && task.is_anytime && newStatus === '確認完了') {
                            // 元の位置に戻す
                            evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex]);
                            window.showToast('随時タスクは「依頼中タスク」に移動してください', 'warning');
                            return;
                        }

                        // 通常のステータス更新
                        await this.updateTaskStatus(taskId, newStatus);
                    } catch (error) {
                        console.error('Failed to update task status:', error);
                        // エラー時は元の位置に戻す
                        evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex]);
                        showToast('タスクの移動に失敗しました', 'error');
                    }
                },
                onMove: (evt) => {
                    // 随時タスクを確認完了にドロップしようとしている場合は禁止
                    const taskId = parseInt(evt.dragged.dataset.taskId);
                    const task = this.tasks.find(t => t.id === taskId);

                    // ドロップ先のステータスを取得（複数の方法で試す）
                    let targetStatus = evt.to.dataset.status || evt.to.parentElement?.dataset.status;

                    // .kanban-tasksクラスの親要素から取得
                    if (!targetStatus) {
                        const kanbanColumn = evt.to.closest('[data-status]');
                        targetStatus = kanbanColumn?.dataset.status;
                    }

                    console.log('🔍 onMove - taskId:', taskId);
                    console.log('🔍 onMove - task found:', task);
                    console.log('🔍 onMove - is_anytime:', task?.is_anytime);
                    console.log('🔍 onMove - targetStatus:', targetStatus);

                    if (task && task.is_anytime && targetStatus === '確認完了') {
                        console.log('❌ 随時タスクを確認完了にドロップは禁止');
                        return false;
                    }

                    return true;
                }
            });
        });
    }

    updateCalendarView(tasks) {
        console.log('📅 updateCalendarView called, tasks:', tasks.length);
        console.log('📅 currentAssigneeFilter:', this.currentAssigneeFilter);

        // 依頼中タスクにアルファベット識別子を付与
        const pendingTasks = tasks.filter(task => task.status === '依頼中');
        pendingTasks.forEach((task, index) => {
            task.alphabetId = this.getAlphabetId(index);
        });

        console.log('📅 pendingTasks:', pendingTasks.length);

        // ガントチャート表示
        this.updateGanttChart(pendingTasks);
        this.updateAllTasksCards(pendingTasks, tasks);
    }

    // アルファベット識別子を生成（A, B, C, ..., Z, AA, AB, ...）
    getAlphabetId(index) {
        let result = '';
        let num = index;
        while (true) {
            result = String.fromCharCode(65 + (num % 26)) + result;
            num = Math.floor(num / 26);
            if (num === 0) break;
            num--;
        }
        return result;
    }

    async updateGanttChart(tasks) {
        // 随時タスクでもwork_dateがあれば表示（tasksは既に依頼中のみ）
        const ganttTasks = tasks.filter(task => task.work_date && task.estimated_time_hours);

        if (ganttTasks.length === 0) {
            document.getElementById('gantt-chart-container').innerHTML = `
                <p style="text-align: center; padding: 30px; color: #6c757d;">
                    予定日が決まったタスクがありません
                </p>
            `;
            return;
        }

        // 担当者フィルターが設定されている場合、そのスタッフの個人休暇を読み込む
        if (this.currentAssigneeFilter !== null) {
            await this.businessDayCalc.loadStaffVacations(this.currentAssigneeFilter);
        }

        // 今日から60日後までの日付を生成
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 60);

        const dates = [];
        for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }

        // カスタムガントチャートHTML生成
        const container = document.getElementById('gantt-chart-container');
        container.innerHTML = this.renderCustomGanttChart(ganttTasks, dates);
    }

    renderCustomGanttChart(tasks, dates) {
        const rowHeight = 30;
        const cellWidth = 30;

        // 月ごとにグループ化
        const monthGroups = [];
        let currentMonth = null;
        let monthStart = 0;

        dates.forEach((date, index) => {
            const month = date.getMonth();
            if (month !== currentMonth) {
                if (currentMonth !== null) {
                    monthGroups.push({ month: currentMonth, start: monthStart, end: index - 1 });
                }
                currentMonth = month;
                monthStart = index;
            }
        });
        monthGroups.push({ month: currentMonth, start: monthStart, end: dates.length - 1 });

        // 日付ヘッダー
        const monthHeaders = monthGroups.map(group => {
            const monthName = `${group.month + 1}月`;
            const width = (group.end - group.start + 1) * cellWidth;
            return `<div style="flex: 0 0 ${width}px; text-align: center; font-weight: 600; color: #495057; background: ${group.month % 2 === 0 ? '#f8f9fa' : '#fff9e6'}; border: ridge 1px #ea950a61; padding: 4px 0;">${monthName}</div>`;
        }).join('');

        const dateHeaders = dates.map((date, index) => {
            const day = date.getDate();
            const dayOfWeek = date.getDay();
            const holidayType = this.businessDayCalc.getHolidayType(date, this.currentAssigneeFilter);

            // 休日タイプに応じた背景色とアイコン
            let bgColor = '#fff';
            let icon = '';

            if (holidayType === 'sunday') {
                bgColor = '#ffe6e6';
            } else if (holidayType === 'saturday') {
                bgColor = '#e6f2ff';
            } else if (holidayType === 'national') {
                bgColor = '#ffe6e6';
                icon = '🏖️';
            } else if (holidayType === 'company') {
                bgColor = '#f0f0f0';
                icon = '🏢';
            } else if (holidayType === 'custom') {
                bgColor = '#f0f0f0';
                icon = '📌';
            } else if (holidayType === 'vacation') {
                bgColor = '#f0f0f0';
                icon = '🌴';
            }

            const dateStr = this.businessDayCalc.formatDate(date);
            const isWeekend = holidayType === 'sunday' || holidayType === 'saturday';
            const isNationalHoliday = holidayType === 'national';
            // 土日・祝日フラグをデータ属性に保存（担当者チェックはクリック時に行う）
            const isHoliday = isWeekend || isNationalHoliday;

            return `
                <div
                    data-date="${dateStr}"
                    data-is-holiday="${isHoliday}"
                    onclick="taskManager.togglePersonalVacation(event)"
                    style="position: absolute; left: ${index * cellWidth}px; width: ${cellWidth}px; text-align: center; font-size: 11px; border-left: 1px solid #e0e0e0; background: ${bgColor}; padding: 4px 0; cursor: ${isHoliday ? 'default' : 'pointer'}; transition: all 0.2s; z-index: 10; pointer-events: auto;"
                    onmouseover="if(this.dataset.isHoliday === 'false') this.style.background = 'rgba(23, 162, 184, 0.2)';"
                    onmouseout="this.style.background = '${bgColor}';">
                    <div style="line-height: 1.2; pointer-events: none;">${day}</div>
                    ${icon ? `<div style="font-size: 8px; line-height: 0; margin-top: 2px; pointer-events: none;">${icon}</div>` : ''}
                </div>
            `;
        }).join('');

        // タスク行
        const taskRows = tasks.map((task, taskIndex) => {
            const startDate = new Date(task.work_date);
            startDate.setHours(0, 0, 0, 0);

            const startIndex = dates.findIndex(d => d.getTime() === startDate.getTime());
            if (startIndex === -1) return '';

            // 営業日ベースで作業期間を計算（個人休暇も考慮）
            const workPeriod = this.businessDayCalc.calculateWorkPeriod(
                startDate,
                task.estimated_time_hours,
                task.assignee_id || this.currentAssigneeFilter  // タスクの担当者IDを使用
            );

            // 作業終了日のインデックスを取得
            const endDate = new Date(workPeriod.endDate);
            endDate.setHours(0, 0, 0, 0);
            const endIndex = dates.findIndex(d => d.getTime() === endDate.getTime());

            // 期限日を取得
            const dueDate = task.due_date ? new Date(task.due_date) : null;
            if (dueDate) dueDate.setHours(0, 0, 0, 0);
            const dueIndex = dueDate ? dates.findIndex(d => d.getTime() === dueDate.getTime()) : -1;

            // 全期間バー（薄い青）の開始位置と幅を計算
            const fullBarStart = startIndex * cellWidth;
            const fullBarWidth = endIndex >= 0 ? (endIndex - startIndex + 1) * cellWidth : cellWidth;

            // 営業日のみの濃い青ブロックを生成
            const businessDayBlocks = workPeriod.businessDays.map(businessDay => {
                const bdIndex = dates.findIndex(d => d.getTime() === businessDay.getTime());
                if (bdIndex === -1) return '';
                return `<div style="position: absolute; left: ${bdIndex * cellWidth + 1}px; width: ${cellWidth - 1}px; height: 20px; top: 5px; background: linear-gradient(135deg, #17a2b8 0%, #20c9e0 100%); border-radius: 3px;"></div>`;
            }).join('');

            return `
                <div style="display: flex; height: ${rowHeight}px; border-bottom: 1px solid #e9ecef; position: relative;">
                    <div style="flex: 0 0 40px; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #007bff; background: #f8f9fa; border-right: 2px solid #dee2e6;">
                        ${task.alphabetId}
                    </div>
                    <div style="flex: 1; position: relative;">
                        ${dates.map((date, i) => {
                            const holidayType = this.businessDayCalc.getHolidayType(date, this.currentAssigneeFilter);

                            // 休日タイプに応じた背景色
                            let bgColor = 'transparent';
                            if (holidayType === 'sunday' || holidayType === 'national') {
                                bgColor = '#ffe6e6';
                            } else if (holidayType === 'saturday') {
                                bgColor = '#e6f2ff';
                            } else if (holidayType === 'company' || holidayType === 'custom' || holidayType === 'vacation') {
                                bgColor = '#f0f0f0';
                            }

                            const dateStr = this.businessDayCalc.formatDate(date);
                            return `<div
                                class="gantt-date-cell"
                                data-date="${dateStr}"
                                ondragover="taskManager.handleGanttDragOver(event)"
                                ondrop="taskManager.handleGanttDrop(event)"
                                style="position: absolute; left: ${i * cellWidth}px; width: ${cellWidth}px; height: 100%; background: ${bgColor}; border-left: 1px solid #e0e0e0;"></div>`;
                        }).join('')}
                        <!-- 全期間バー（薄い青・下層） -->
                        <div style="position: absolute; left: ${fullBarStart}px; width: ${fullBarWidth}px; height: 20px; top: 5px; background: rgba(23, 162, 184, 0.25); border-radius: 4px; border: 1px solid rgba(23, 162, 184, 0.5);"></div>
                        <!-- 営業日ブロック（濃い青・上層） -->
                        ${businessDayBlocks}
                        <!-- タスクIDラベル（ドラッグ可能） -->
                        <div
                            draggable="true"
                            data-task-id="${task.id}"
                            data-task-assignee="${task.assignee_id || this.currentAssigneeFilter}"
                            ondragstart="taskManager.handleGanttDragStart(event)"
                            ondragend="taskManager.handleGanttDragEnd(event)"
                            style="position: absolute; left: ${fullBarStart}px; width: ${fullBarWidth}px; height: 20px; top: 5px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; cursor: move; text-shadow: 0 1px 2px rgba(0,0,0,0.5); pointer-events: auto;"
                            title="${task.task_name}">
                            ${task.alphabetId}
                        </div>
                        ${dueIndex >= 0 ? `<div style="position: absolute; left: ${(dueIndex + 1) * cellWidth - 2}px; width: 4px; height: 100%; background: #dc3545; top: 0;"></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="overflow-x: auto; background: white; border-radius: 8px;">
                <div style="min-width: ${40 + dates.length * cellWidth}px;">
                    <!-- 月ヘッダー -->
                    <div style="display: flex; border-bottom: 2px solid #dee2e6;">
                        <div style="flex: 0 0 40px;"></div>
                        <div style="flex: 1; display: flex;">
                            ${monthHeaders}
                        </div>
                    </div>
                    <!-- 日付ヘッダー -->
                    <div style="display: flex; border-bottom: 2px solid #dee2e6;">
                        <div style="flex: 0 0 40px; display: flex; align-items: center; justify-content: center; font-weight: 600; background: #f8f9fa;">ID</div>
                        <div style="flex: 1; position: relative; height: 28px;">
                            ${dateHeaders}
                        </div>
                    </div>
                    <!-- タスク行 -->
                    ${taskRows}
                </div>
            </div>
        `;
    }

    async updateTaskDates(taskId, startDate, endDate) {
        try {
            const updateData = {
                work_date: startDate,
                due_date: endDate
            };

            const { error } = await supabase
                .from('tasks')
                .update(updateData)
                .eq('id', taskId);

            if (error) throw error;

            showToast('タスクの日付を更新しました', 'success');
            await this.loadTasks();
            this.updateDisplay();
            this.updateSummary();
            this.updateMyTasks();

        } catch (error) {
            console.error('Update task dates error:', error);
            showToast('日付の更新に失敗しました', 'error');
        }
    }

    // 全タスクを統一カード形式で表示（5列レイアウト）
    updateAllTasksCards(pendingTasks, allTasks) {
        // 依頼中タスク（随時含む全て）
        const allPendingTasks = pendingTasks;
        // 確認待ちタスク
        const workingTasks = allTasks.filter(task => task.status === '作業完了');
        // 確認完了タスク
        const completedTasks = allTasks.filter(task => task.status === '確認完了');

        // 依頼中タスク表示（随時含む）
        this.renderTaskCards('anytime-tasks-list', allPendingTasks, '依頼中タスクはありません');

        // 確認待ちタスク表示
        this.renderTaskCards('working-tasks-list', workingTasks, '確認待ちタスクはありません', false, true);
        document.getElementById('working-tasks-count').textContent = workingTasks.length;

        // 確認完了タスク表示
        this.renderTaskCards('completed-tasks-list', completedTasks, '確認完了タスクはありません', false, true, true);
        document.getElementById('completed-tasks-count').textContent = completedTasks.length;
    }

    // タスクカードレンダリング（5列統一レイアウト）
    renderTaskCards(containerId, tasks, emptyMessage, isAnytime = false, showRestoreBtn = false, showDueDate = false) {
        const container = document.getElementById(containerId);

        if (tasks.length === 0) {
            container.innerHTML = `<p style="margin: 0; color: #856404;">${emptyMessage}</p>`;
            return;
        }

        container.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${tasks.map(task => {
                    const clientName = (task.client_id === 0 || task.client_id === null)
                        ? 'その他業務'
                        : (task.clients?.name || '-');

                    // バッジ（右上）
                    const badge = isAnytime
                        ? `<div style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: #ffc107; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">随</div>`
                        : task.alphabetId
                        ? `<div style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: #007bff; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${task.alphabetId}</div>`
                        : '';

                    const dueDate = showDueDate && task.due_date ? this.formatMonthDay(task.due_date) : '';

                    return `
                        <div
                            draggable="true"
                            data-task-id="${task.id}"
                            data-task-status="${task.status}"
                            ondragstart="taskManager.handleCardDragStart(event)"
                            ondragend="taskManager.handleCardDragEnd(event)"
                            style="
                            position: relative;
                            flex: 0 0 calc(10% - 10px);
                            padding: 10px;
                            padding-right: ${badge ? '45px' : '10px'};
                            background: #fff;
                            border: 1px solid ${isAnytime ? '#ffc107' : showDueDate ? '#28a745' : '#ffc107'};
                            border-radius: 6px;
                            cursor: move;
                            transition: all 0.2s;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                        "
                            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.15)';"
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';"
                            ondblclick="taskManager.openTaskInEditMode(${task.id})">
                            ${badge}
                            <div style="font-weight: 600; font-size: 13px; color: #495057; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${task.task_name || 'Untitled'}">
                                ${task.task_name || 'Untitled'}
                            </div>
                            <div style="font-size: 12px; color: #6c757d; opacity: 0.9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${clientName}">
                                ${clientName}
                            </div>
                            ${dueDate ? `<div style="font-size: 11px; color: #6c757d; opacity: 0.7; margin-top: 4px;">期限: ${dueDate}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }


    updateSummary() {
        const totalTasks = this.tasks.length;
        const pendingTasks = this.tasks.filter(task => task.status === '依頼中').length;
        const workingTasks = this.tasks.filter(task => task.status === '作業完了').length;
        const completedTasks = this.tasks.filter(task => task.status === '確認完了').length;

        document.getElementById('total-tasks').textContent = totalTasks;
        document.getElementById('pending-tasks').textContent = pendingTasks;
        document.getElementById('working-tasks').textContent = workingTasks;
        document.getElementById('completed-tasks').textContent = completedTasks;
    }

    openTaskModal(taskId = null, template = null, viewMode = false, templateMode = false, templateName = '') {
        const modal = document.getElementById('task-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('task-form');
        const saveBtn = document.getElementById('save-task-btn');

        form.reset();
        this.setModalMode(viewMode ? 'view' : 'edit');

        // テンプレート保存モード
        if (templateMode) {
            title.textContent = `テンプレート作成: ${templateName}`;
            form.dataset.templateMode = 'true';
            form.dataset.templateName = templateName;
            saveBtn.textContent = 'テンプレートとして保存';

            // テンプレート保存時は事業者・受任者選択を不要にする
            document.getElementById('client-select').removeAttribute('required');
            document.getElementById('assignee-select').removeAttribute('required');
        } else {
            form.dataset.templateMode = 'false';
            saveBtn.textContent = '保存';

            // 通常のタスク保存時は必須項目を復元
            document.getElementById('client-select').setAttribute('required', 'required');
            document.getElementById('assignee-select').setAttribute('required', 'required');
        }

        if (taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                title.textContent = viewMode ? 'タスク詳細' : 'タスク編集';
                document.getElementById('task-name').value = task.task_name || '';

                // 検索可能プルダウンに値を設定（nullの場合は0=その他業務）
                const clientIdForDisplay = task.client_id === null ? 0 : (task.client_id ?? '');
                if (this.searchableSelect) {
                    this.searchableSelect.setValue(clientIdForDisplay);
                } else {
                    document.getElementById('client-select').value = clientIdForDisplay;
                }

                document.getElementById('assignee-select').value = task.assignee_id || '';
                document.getElementById('priority-select').value = task.priority || '2';
                document.getElementById('due-date').value = task.due_date || '';
                document.getElementById('work-date').value = task.work_date || '';
                document.getElementById('estimated-hours').value = task.estimated_time_hours || '';
                document.getElementById('task-description').value = task.description || '';
                document.getElementById('reference-url').value = task.reference_url || '';

                // 随時チェックボックスの設定
                const isAnytimeCheckbox = document.getElementById('is-anytime');
                const dueDateInput = document.getElementById('due-date');
                if (isAnytimeCheckbox) {
                    isAnytimeCheckbox.checked = task.is_anytime || false;
                    if (task.is_anytime) {
                        dueDateInput.disabled = true;
                        dueDateInput.style.backgroundColor = '#e9ecef';
                    } else {
                        dueDateInput.disabled = false;
                        dueDateInput.style.backgroundColor = '';
                    }
                }

                // URL自動リンク表示を更新
                if (this.linkedTextDisplay) {
                    this.linkedTextDisplay.updateDisplay();
                }
                if (this.referenceUrlDisplay) {
                    this.referenceUrlDisplay.updateDisplay();
                }

                // 削除ボタンの表示制御（自分が作成したタスクのみ）
                const deleteBtn = document.getElementById('delete-task-btn');
                if (deleteBtn) {
                    deleteBtn.style.display = task.requester_id === this.currentUser.id ? 'inline-block' : 'none';
                }

                // タスク詳細情報の表示（既存タスクの場合は常に表示）
                this.showTaskDetailInfo(task);
            }
            form.dataset.taskId = taskId;
        } else if (!templateMode) {
            title.textContent = template ? `テンプレートから作成: ${template.template_name}` : '新規タスク作成';
            form.dataset.taskId = '';
            this.setModalMode('edit'); // 新規作成は常に編集モード
            this.hideTaskDetailInfo(); // 新規作成時は詳細情報を隠す

            // 検索可能プルダウンをクリア
            if (this.searchableSelect) {
                this.searchableSelect.clear();
            } else {
                // フォールバック：直接クリア
                document.getElementById('client-select').value = '';
                document.getElementById('client-search').value = '';
            }

            if (template) {
                // テンプレートデータでフォームを埋める
                document.getElementById('task-name').value = template.task_name || '';
                document.getElementById('task-description').value = template.description || '';
                document.getElementById('estimated-hours').value = template.estimated_time_hours || '';
                document.getElementById('reference-url').value = template.reference_url || '';

                // 事業者IDを設定（検索可能ドロップダウン）（nullの場合は0=その他業務）
                const templateClientId = template.client_id === null ? 0 : template.client_id;
                if (templateClientId !== null && templateClientId !== undefined) {
                    if (this.searchableSelect) {
                        this.searchableSelect.setValue(templateClientId);
                    } else {
                        document.getElementById('client-select').value = templateClientId;
                    }
                }

                // URL自動リンク表示を更新
                if (this.linkedTextDisplay) {
                    this.linkedTextDisplay.updateDisplay();
                }
                if (this.referenceUrlDisplay) {
                    this.referenceUrlDisplay.updateDisplay();
                }
            }

            // デフォルト値設定（優先順位: テンプレート既定受任者 > 担当者フィルター選択中 > ログインユーザー）
            if (template && template.default_assignee_id) {
                // テンプレートに既定の受任者が設定されている場合はそれを使用
                document.getElementById('assignee-select').value = template.default_assignee_id;
            } else if (this.currentAssigneeFilter !== null) {
                // 担当者フィルターで担当者を選択している場合はその担当者を設定
                document.getElementById('assignee-select').value = this.currentAssigneeFilter;
            } else if (this.currentUser) {
                // どちらも設定されていない場合は現在のユーザーを設定
                document.getElementById('assignee-select').value = this.currentUser.id;
            }

            // 新規作成時は削除ボタンを隠す
            const deleteBtn = document.getElementById('delete-task-btn');
            if (deleteBtn) {
                deleteBtn.style.display = 'none';
            }
        }

        modal.style.display = 'flex';
        this.setUserInteracting(true); // モーダル表示時は操作中フラグON
    }

    setModalMode(mode) {
        const form = document.getElementById('task-form');
        const inputs = form.querySelectorAll('input, select, textarea');
        const viewModeButtons = document.getElementById('view-mode-buttons');
        const editModeButtons = document.getElementById('edit-mode-buttons');
        const deleteBtn = document.getElementById('delete-task-btn');

        if (mode === 'view') {
            // 閲覧モード
            inputs.forEach(input => {
                // 隠しselect要素はdisabledにしない（検索可能プルダウンが動作しなくなるため）
                if (input.style.display !== 'none') {
                    input.disabled = true;
                    input.style.backgroundColor = '#f8f9fa';
                }
            });
            viewModeButtons.style.display = 'flex';
            editModeButtons.style.display = 'none';
        } else {
            // 編集モード
            inputs.forEach(input => {
                input.disabled = false;
                input.style.backgroundColor = '';
            });
            viewModeButtons.style.display = 'none';
            editModeButtons.style.display = 'flex';

            // 削除ボタンの表示制御（自分が作成したタスクのみ表示）
            const taskId = form.dataset.taskId;
            if (taskId && deleteBtn) {
                const task = this.tasks.find(t => t.id === parseInt(taskId));
                if (task && task.requester_id === this.currentUser.id) {
                    deleteBtn.style.display = 'inline-block';
                } else {
                    deleteBtn.style.display = 'none';
                }
            }
        }
    }

    closeTaskModal() {
        const modal = document.getElementById('task-modal');
        modal.style.display = 'none';
        this.setUserInteracting(false); // モーダル閉じる時は操作中フラグOFF
    }

    // タスク詳細情報の表示
    showTaskDetailInfo(task) {
        const requesterInfo = document.getElementById('requester-info');
        const requesterName = document.getElementById('requester-name');
        const statusContainer = document.getElementById('status-button-container');

        // 依頼者情報の表示
        if (task.requester && task.requester.name) {
            requesterName.textContent = task.requester.name;
            requesterInfo.style.display = 'flex';
        } else {
            requesterInfo.style.display = 'none';
        }

        // ステータスボタンの表示
        const statusButton = this.createClickableStatusBadge(task);
        statusContainer.innerHTML = statusButton;
        statusContainer.style.display = 'block';
    }

    // タスク詳細情報の非表示
    hideTaskDetailInfo() {
        const requesterInfo = document.getElementById('requester-info');
        const statusContainer = document.getElementById('status-button-container');

        requesterInfo.style.display = 'none';
        statusContainer.style.display = 'none';
    }

    // モーダル内のステータス表示を更新
    updateModalStatusDisplay(taskId, newStatus) {
        const modal = document.getElementById('task-modal');
        const statusContainer = document.getElementById('status-button-container');

        // モーダルが表示されていて、該当のタスクが開いている場合のみ更新
        if (modal.style.display !== 'none' && statusContainer.style.display !== 'none') {
            const form = document.getElementById('task-form');
            const currentTaskId = parseInt(form.dataset.taskId);

            if (currentTaskId === taskId) {
                // 更新されたタスクデータを取得
                const updatedTask = this.tasks.find(t => t.id === taskId);
                if (updatedTask) {
                    // ステータスボタンを再生成
                    updatedTask.status = newStatus; // ステータスを更新
                    const newStatusButton = this.createClickableStatusBadge(updatedTask);
                    statusContainer.innerHTML = newStatusButton;
                }
            }
        }
    }

    openTemplateModal() {
        const modal = document.getElementById('template-modal');
        const templateList = document.getElementById('template-list');

        // テンプレート一覧を生成
        templateList.innerHTML = '';

        if (this.templates.length === 0) {
            templateList.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #6c757d;">
                    <p>📝 テンプレートがありません</p>
                    <button class="btn btn-primary" onclick="taskManager.createTemplate()">
                        新しいテンプレートを作成
                    </button>
                </div>
            `;
            return;
        }

        this.templates.forEach(template => {
            const templateItem = document.createElement('div');
            templateItem.className = 'template-item';
            templateItem.dataset.templateId = template.id;

            templateItem.innerHTML = `
                <div class="template-name">
                    <span class="template-type" style="font-size: 0.8rem; color: #6c757d; margin-right: 8px;">📋</span>
                    ${template.template_name}
                </div>
                <div class="template-task-name">${template.task_name || ''}</div>
                <div class="template-description">${template.description || ''}</div>
                <div class="template-hours">⏱️ 想定時間: ${template.estimated_time_hours || '未設定'}時間</div>
            `;

            templateItem.addEventListener('click', () => {
                this.selectTemplate(template);
            });

            templateList.appendChild(templateItem);
        });

        // 新規テンプレート作成ボタンを追加
        const createTemplateBtn = document.createElement('div');
        createTemplateBtn.className = 'template-item template-create';
        createTemplateBtn.style.cssText = 'border: 2px dashed #007bff; color: #007bff; text-align: center; font-weight: 500;';
        createTemplateBtn.innerHTML = `
            <div style="padding: 20px;">
                <div style="font-size: 1.2rem; margin-bottom: 5px;">➕</div>
                <div>新しいテンプレートを作成</div>
            </div>
        `;

        createTemplateBtn.addEventListener('click', () => {
            this.createTemplate();
        });

        templateList.appendChild(createTemplateBtn);

        modal.style.display = 'flex';
        this.setUserInteracting(true); // テンプレートモーダル表示時は操作中フラグON
    }

    closeTemplateModal() {
        const modal = document.getElementById('template-modal');
        modal.style.display = 'none';
        this.setUserInteracting(false); // テンプレートモーダル閉じる時は操作中フラグOFF

        // タブナビゲーションを再有効化
        this.disableTabNavigation(false);
    }

    selectTemplate(template) {
        // テンプレートモーダルを閉じる
        this.closeTemplateModal();

        // テンプレートデータでタスクモーダルを開く
        this.openTaskModal(null, template);
    }

    async saveTask() {
        const form = document.getElementById('task-form');
        const taskId = form.dataset.taskId;
        const isEdit = !!taskId;
        const isTemplateMode = form.dataset.templateMode === 'true';
        const templateName = form.dataset.templateName;

        // フォームデータ取得
        const clientSelectValue = document.getElementById('client-select').value;
        const parsedClientId = clientSelectValue !== '' ? parseInt(clientSelectValue) : null;

        const isAnytime = document.getElementById('is-anytime').checked;

        const taskData = {
            task_name: document.getElementById('task-name').value.trim(),
            // client_id が 0（その他業務）の場合は null として保存（フロントエンドで表示時に0として扱う）
            client_id: parsedClientId === 0 ? null : parsedClientId,
            assignee_id: parseInt(document.getElementById('assignee-select').value) || null,
            priority: parseInt(document.getElementById('priority-select').value) || 2,
            due_date: isAnytime ? null : (document.getElementById('due-date').value || null),
            work_date: document.getElementById('work-date').value || null,
            estimated_time_hours: parseFloat(document.getElementById('estimated-hours').value) || null,
            description: document.getElementById('task-description').value.trim() || null,
            reference_url: document.getElementById('reference-url').value.trim() || null,
            is_anytime: isAnytime
        };

        // テンプレート保存モード
        if (isTemplateMode) {
            if (!taskData.task_name) {
                showToast('タスク名を入力してください', 'error');
                return;
            }

            await this.saveTemplate(templateName, taskData);
            this.closeTaskModal();
            return;
        }

        // 通常のタスク保存のバリデーション
        if (!taskData.task_name) {
            showToast('タスク名を入力してください', 'error');
            return;
        }

        // client_id が未選択の場合のみエラー（0は「その他業務」として有効）
        if (parsedClientId === null || parsedClientId === undefined || isNaN(parsedClientId)) {
            showToast('事業者を選択してください', 'error');
            return;
        }

        if (!taskData.assignee_id) {
            showToast('受任者を選択してください', 'error');
            return;
        }

        try {
            document.getElementById('loading').style.display = 'flex';

            if (isEdit) {
                // 更新
                const { error } = await supabase
                    .from('tasks')
                    .update(taskData)
                    .eq('id', taskId);

                if (error) throw error;
                showToast('タスクを更新しました', 'success');
            } else {
                // 新規作成
                taskData.requester_id = this.currentUser.id;
                taskData.status = '依頼中';

                const { error } = await supabase
                    .from('tasks')
                    .insert([taskData]);

                if (error) throw error;
                showToast('タスクを作成しました', 'success');
            }

            this.closeTaskModal();
            await this.loadTasks(); // データ再読み込み
            this.updateDisplay(); // 画面更新
            this.updateSummary(); // サマリー更新
            this.updateMyTasks(); // 受任タスク一覧更新

        } catch (error) {
            console.error('Save task error:', error);
            showToast('保存に失敗しました', 'error');
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
    }

    async updateTaskStatus(taskId, newStatus) {
        try {
            // タスク情報を取得
            const task = this.tasks.find(t => t.id === taskId);

            const updateData = { status: newStatus };

            if (newStatus === '作業完了') {
                updateData.completed_at = new Date().toISOString();
            } else if (newStatus === '確認完了') {
                updateData.confirmed_at = new Date().toISOString();
            }

            // 随時タスクが「確認待ち→依頼中」に戻る場合、work_dateを削除
            if (task && task.is_anytime && newStatus === '依頼中') {
                updateData.work_date = null;
                console.log('随時タスクが依頼中に戻ったため、work_dateを削除しました');
            }

            const { error } = await supabase
                .from('tasks')
                .update(updateData)
                .eq('id', taskId);

            if (error) throw error;

            showToast(`タスクを「${newStatus}」に更新しました`, 'success');
            await this.loadTasks(); // データ再読み込み
            this.updateDisplay(); // 画面更新
            this.updateSummary(); // サマリー更新
            this.updateMyTasks(); // 受任タスク一覧更新

            // モーダルが開いている場合、ステータス表示を更新
            this.updateModalStatusDisplay(taskId, newStatus);

        } catch (error) {
            console.error('Update status error:', error);
            showToast('ステータス更新に失敗しました', 'error');
        }
    }

    async cycleTaskStatus(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        // 随時タスクの場合：依頼中 ⇔ 確認待ち のループ
        // 通常タスクの場合：依頼中 → 確認待ち → 確認完了 → 依頼中
        let nextStatus;
        if (task.is_anytime) {
            // 随時タスク：依頼中 ⇔ 作業完了（確認待ち）
            const statusCycle = {
                '依頼中': '作業完了',
                '作業完了': '依頼中'
            };
            nextStatus = statusCycle[task.status] || '作業完了';
        } else {
            // 通常タスク：依頼中 → 作業完了 → 確認完了 → 依頼中
            const statusCycle = {
                '依頼中': '作業完了',
                '作業完了': '確認完了',
                '確認完了': '依頼中'
            };
            nextStatus = statusCycle[task.status] || '作業完了';
        }

        await this.updateTaskStatus(taskId, nextStatus);
    }

    editTask(taskId) {
        this.openTaskModal(taskId, null, true); // 閲覧モードで開く
    }

    openTaskInEditMode(taskId) {
        this.openTaskModal(taskId, null, false); // 直接編集モードで開く
    }

    async deleteTask(taskId) {
        if (!confirm('このタスクを削除しますか？')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);

            if (error) throw error;

            showToast('タスクを削除しました', 'success');
            await this.loadTasks(); // データ再読み込み
            this.updateDisplay(); // 画面更新
            this.updateSummary(); // サマリー更新
            this.updateMyTasks(); // 受任タスク一覧更新
            this.closeTaskModal(); // モーダルを閉じる

        } catch (error) {
            console.error('Delete task error:', error);
            showToast('削除に失敗しました', 'error');
        }
    }

    // マイタスクパネル関連メソッド
    updateMyTasks() {
        if (!this.currentUser) return;

        // 時間ベースの非表示フィルターを適用
        const visibleTasks = this.applyTimeBasedVisibility(this.tasks);

        // 受任タスク（自分が実行する、確認完了以外）
        const assignedTasksRaw = visibleTasks
            .filter(task =>
                task.assignee_id === this.currentUser.id &&
                task.status !== '確認完了'
            );
        const assignedTasks = this.sortMyAssignedTasks(assignedTasksRaw);

        // 依頼タスク（自分が作成した、ただし自分自身のタスクは除く、確認完了以外）
        const requestedTasksRaw = visibleTasks
            .filter(task =>
                task.requester_id === this.currentUser.id &&
                task.assignee_id !== this.currentUser.id &&
                task.status !== '確認完了'
            );
        const requestedTasks = this.sortMyRequestedTasks(requestedTasksRaw);

        // 確認完了したタスク（自分が関わったもの、時間ベースフィルター適用）
        const completedTasks = visibleTasks.filter(task =>
            (task.assignee_id === this.currentUser.id || task.requester_id === this.currentUser.id) &&
            task.status === '確認完了'
        );

        // 総タスク数（完了済みは除く）
        const totalMyTasks = assignedTasks.length + requestedTasks.length;

        // カウント更新（受任タスクは「依頼中」のみをカウント）
        const pendingAssignedTasks = assignedTasks.filter(task => task.status === '依頼中');
        document.getElementById('assigned-count').textContent = pendingAssignedTasks.length;
        document.getElementById('requested-count').textContent = requestedTasks.length;
        document.getElementById('completed-count').textContent = completedTasks.length;
        document.getElementById('my-task-count').textContent = `${totalMyTasks}件`;

        // 受任タスクリスト更新
        this.updateCompactTaskList('assigned-task-list', assignedTasks);

        // 依頼タスクリスト更新
        this.updateCompactTaskList('requested-task-list', requestedTasks);

        // 確認完了タスクリスト更新（グレーアウト）
        this.updateCompactTaskList('completed-task-list', completedTasks, true);
    }

    updateCompactTaskList(containerId, tasks, isCompleted = false) {
        const container = document.getElementById(containerId);

        if (tasks.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #6c757d; font-size: 0.8rem; padding: 0px;">該当するタスクはありません</div>';
            return;
        }

        container.innerHTML = '';

        tasks.forEach(task => {
            const taskItem = this.createCompactTaskItem(task, isCompleted);
            container.appendChild(taskItem);
        });
    }

    createCompactTaskItem(task, isCompleted = false) {
        const item = document.createElement('div');
        item.className = 'compact-task-item';
        item.dataset.taskId = task.id;

        // 完了済みタスクまたは確認完了ステータスの場合はグレーアウト
        if (isCompleted || task.status === '確認完了') {
            item.classList.add('task-completed-gray');
        }

        const dueDateText = this.formatDueDateWithWarning(task.due_date, task.is_anytime, task.status);
        const dueDateClass = this.getDueDateClass(task.due_date);

        const statusConfig = {
            '依頼中': { class: 'compact-status-pending', text: '依頼中' },
            '作業完了': { class: 'compact-status-working', text: '確認待ち' },
            '確認完了': { class: 'compact-status-completed', text: '確認完了' }
        };

        const statusBadge = statusConfig[task.status] || statusConfig['依頼中'];

        // 2行レイアウト用のデータ準備
        const priorityStars = this.getPriorityDisplay(task.priority);
        const truncatedDescription = task.description ?
            (task.description.length > 15 ? task.description.substring(0, 15) + '…' : task.description) : '-';

        // 事業者リンク（完了済みの場合は通常テキスト）
        const clientLink = (task.client_id === 0 || task.client_id === null) ?
            `<span style="color: ${isCompleted ? '#6c757d' : '#495057'}; font-size: 15px;">その他業務</span>` :
            task.clients?.name ?
            (isCompleted ?
                `<span style="color: #6c757d; font-size: 15px;">${task.clients.name}</span>` :
                `<a href="../../details.html?id=${task.client_id}" title="${task.clients.name}" onclick="event.stopPropagation()" style="color: #007bff; text-decoration: none; font-size: 15px;">${task.clients.name}</a>`
            ) : '-';

        // 参照URLアイコン（完了済みの場合はグレー）
        const urlIcon = task.reference_url ?
            (isCompleted ?
                `<span style="font-size: 0.8rem; color: #adb5bd;">🔗</span>` :
                `<a href="${task.reference_url}" target="_blank" title="${task.reference_url}" onclick="event.stopPropagation()" style="font-size: 0.8rem;">🔗</a>`
            ) : '-';

        // ステータス（常にクリック可能、ループ動作）
        const clickableStatus = this.createCompactClickableStatus(task);

        // 委任者/受任者の表示（ラベル付き）
        const isAssigned = task.assignee_id === this.currentUser.id;
        const personLabel = isAssigned ? '委任者' : '受任者';
        const personName = isAssigned ? (task.requester?.name || '-') : (task.assignee?.name || '-');
        const personDisplay = personName !== '-' ? `${personLabel}：${personName.length > 6 ? personName.substring(0, 6) + '…' : personName}` : `${personLabel}：-`;

        // 日付表示（ラベル付き）
        const dueDateDisplay = dueDateText !== '-' ? `期限：${dueDateText}` : '期限：-';
        const workDateDisplay = task.work_date ? `予定：${this.formatMonthDay(task.work_date)}` : '予定：-';

        // 完了済みの場合の色調整
        const textColor = isCompleted ? '#6c757d' : '#495057';
        const linkColor = isCompleted ? '#6c757d' : (dueDateClass ? '#dc3545' : '#495057');

        item.innerHTML = `
            <div class="task-header" style="display: flex; position: relative; width: 100%;">
                <!-- 左側：メイン情報エリア -->
                <div class="task-details" style="flex: 1; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; padding-right: 5em; min-width: 0;">
                    <!-- 上段 -->
                    <div style="display: flex; align-items: center; gap: 0.5em; width: 100%; min-width: 0;">
                        <span style="font-size: clamp(12px, 0.9em, 15px); flex: 0 0 auto; white-space: nowrap; min-width: 12em; max-width: 12em; overflow: hidden; text-overflow: ellipsis;" title="${(task.client_id === 0 || task.client_id === null) ? 'その他業務' : (task.clients?.name || '')}">${clientLink}</span>
                        <span style="font-size: clamp(12px, 0.8em, 13px); font-weight: 600; flex: auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${textColor};" title="${task.task_name || 'Untitled Task'}">${task.task_name || 'Untitled Task'}</span>
                        <span style="font-size: clamp(12px, 0.7em, 13px); flex: auto; max-width: 18em; color: #6c757d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;" title="${task.description || ''}">${truncatedDescription}</span>
                    </div>
                    <!-- 下段 -->
                    <div class="task-meta" style="display: flex; align-items: center; gap: 0.8em; font-size: clamp(9px, 0.7em, 11px); color: ${textColor}; white-space: nowrap; width: 100%; min-width: 0;">
                        <span style="flex: 0 0 auto; white-space: nowrap; color: ${textColor};" title="${this.getPriorityText(task.priority)}">${priorityStars}</span>
                        <span style="flex: 0 0 auto; text-align: center; white-space: nowrap;">${urlIcon}</span>
                        <span style="flex: 0 0 auto; font-size: clamp(10px, 0.75em, 13px); white-space: nowrap; min-width: 4em; max-width: 8em; overflow: hidden; text-overflow: ellipsis;">${personDisplay}</span>
                        <span style="flex: 0 0 auto; font-size: clamp(10px, 0.75em, 13px); color: ${linkColor}; white-space: nowrap; min-width: 4em;" title="${task.due_date || ''}">${dueDateDisplay}</span>
                        <span style="flex: 0 0 auto; font-size: clamp(10px, 0.75em, 13px); white-space: nowrap; min-width: 4em;" title="${task.work_date || ''}">${workDateDisplay}</span>
                    </div>
                </div>

                <!-- 簡易表示用のデータ要素（通常は非表示） -->
                <div class="task-info" style="display: none;">
                    <span class="client-name" data-client-id="${task.client_id}" onclick="event.stopPropagation(); ${(task.client_id === 0 || task.client_id === null) ? '' : `window.location.href='../../details.html?id=${task.client_id}'`}">${(task.client_id === 0 || task.client_id === null) ? 'その他業務' : (task.clients?.name || '-')}</span>
                    <span class="task-name">${task.task_name || 'Untitled Task'}</span>
                    <span class="due-date">期限：${this.formatDueDateWithWarning(task.due_date, task.is_anytime, task.status)}</span>
                </div>

                <!-- 右側：ステータス（上下段をまたがって表示） -->
                <div class="task-actions" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; height: 100%;">
                    <span class="status-badge">${clickableStatus}</span>
                </div>
            </div>
        `;

        // 行クリックイベント（直接編集モード表示）
        item.addEventListener('click', (e) => {
            // リンクやステータスクリック時は無視
            if (e.target.closest('a') || e.target.closest('.my-task-status')) {
                return;
            }
            this.openTaskInEditMode(task.id);
        });

        return item;
    }

    // 簡易表示モードの切り替え
    toggleSimpleView(isSimple) {
        this.isSimpleView = isSimple;

        // LocalStorageに保存
        localStorage.setItem('taskManagement_simpleView', isSimple.toString());

        // ラベルとコンテナクラスを更新
        const label = document.getElementById('simple-view-label');
        const assignedContainer = document.getElementById('assigned-task-list');
        const requestedContainer = document.getElementById('requested-task-list');
        const completedContainer = document.getElementById('completed-task-list');

        if (label) {
            label.textContent = isSimple ? '📄 簡易表示' : '📋 詳細表示';
        }

        // 全てのマイタスクコンテナに簡易表示クラスを適用
        [assignedContainer, requestedContainer, completedContainer].forEach(container => {
            if (container) {
                if (isSimple) {
                    container.classList.add('simple-view');
                } else {
                    container.classList.remove('simple-view');
                }
            }
        });

        // タスクリストを再描画
        this.updateMyTasks();
    }

    createCompactClickableStatus(task) {
        // 随時タスクと通常タスクで異なるステータス遷移を表示
        let statusConfig, config;

        if (task.is_anytime) {
            // 随時タスク：依頼中 ⇔ 確認待ち
            statusConfig = {
                '依頼中': { class: 'my-task-status-pending', text: '📝 依頼中', next: '確認待ち' },
                '作業完了': { class: 'my-task-status-working', text: '✅ 確認待ち', next: '依頼中' }
            };
        } else {
            // 通常タスク：依頼中 → 確認待ち → 確認完了 → 依頼中
            statusConfig = {
                '依頼中': { class: 'my-task-status-pending', text: '📝 依頼中', next: '確認待ち' },
                '作業完了': { class: 'my-task-status-working', text: '✅ 確認待ち', next: '確認完了' },
                '確認完了': { class: 'my-task-status-completed', text: '☑️ 確認完了', next: '依頼中' }
            };
        }

        config = statusConfig[task.status] || statusConfig['依頼中'];
        return `<span class="my-task-status ${config.class}" style="cursor: pointer; padding: 4px 8px; border-radius: 12px; font-size: 13px; font-weight: 500; min-width: 70px; text-align: center; border: 1px solid #d2b866;"
                      title="クリックで「${config.next}」に変更"
                      onclick="event.stopPropagation(); taskManager.cycleTaskStatus(${task.id})">${config.text}</span>`;
    }

    createStaticStatus(task) {
        return `<span style="padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500; min-width: 70px; text-align: center; background: #e9ecef; color: #6c757d; border: 1px solid #ced4da;">☑️ 確認完了</span>`;
    }


    // テンプレート作成機能
    createTemplate() {
        const templateName = prompt('テンプレート名を入力してください:');
        if (!templateName) return;

        // テンプレートモーダルを閉じる
        this.closeTemplateModal();

        // 新規タスクモーダルを開く（テンプレート保存モード）
        this.openTaskModal(null, null, false, true, templateName);
    }

    async saveTemplate(templateName, taskData) {
        try {
            const templateData = {
                template_name: templateName,
                task_name: taskData.task_name,
                description: taskData.description,
                estimated_time_hours: taskData.estimated_time_hours
            };

            const { error } = await supabase
                .from('task_templates')
                .insert([templateData]);

            if (error) throw error;

            showToast('テンプレートを保存しました', 'success');
            await this.loadTemplates(); // テンプレート再読み込み

        } catch (error) {
            console.error('Save template error:', error);
            showToast('テンプレートの保存に失敗しました', 'error');
        }
    }
    // 時間ベースの非表示処理（受託者・依頼者別の非表示ルール）
    applyTimeBasedVisibility(tasks) {
        if (!this.currentUser) return tasks;

        // 日本時間での今日の日付を取得（UTC+9）
        const now = new Date();
        const jstOffset = 9 * 60; // JSTはUTC+9時間
        const jstNow = new Date(now.getTime() + (jstOffset * 60 * 1000));
        const today = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());

        return tasks.filter(task => {
            // ========================================
            // 【一時的にコメントアウト】確認待ち（作業完了）タスクの受託者への非表示処理
            // TODO: 後で再実装する際は、以下のコメントを解除してください
            // ========================================
            // if (task.status === '作業完了' && task.completed_at && task.assignee_id === this.currentUser.id) {
            //     const completedDate = new Date(task.completed_at);
            //     const jstCompletedDate = new Date(completedDate.getTime() + (jstOffset * 60 * 1000));
            //     const completedDay = new Date(jstCompletedDate.getFullYear(), jstCompletedDate.getMonth(), jstCompletedDate.getDate());
            //     const diffDays = Math.floor((today - completedDay) / (1000 * 60 * 60 * 24));
            //
            //     // 受託者のみ：翌日以降は非表示（依頼者には表示される）
            //     if (diffDays >= 1) {
            //         return false;
            //     }
            // }

            // 確認完了タスクの全員への非表示処理（ステータスが「確認完了」でかつconfirmed_atがある場合のみ）
            if (task.status === '確認完了' && task.confirmed_at) {
                const confirmedDate = new Date(task.confirmed_at);
                const jstConfirmedDate = new Date(confirmedDate.getTime() + (jstOffset * 60 * 1000));
                const confirmedDay = new Date(jstConfirmedDate.getFullYear(), jstConfirmedDate.getMonth(), jstConfirmedDate.getDate());
                const diffDays = Math.floor((today - confirmedDay) / (1000 * 60 * 60 * 24));

                // 全員：翌日以降は非表示
                if (diffDays >= 1) {
                    return false;
                }
            }

            return true;
        });
    }

    // マイタスクのソート改善（受任中：依頼中→確認待ち）
    sortMyAssignedTasks(tasks) {
        return tasks.sort((a, b) => {
            const statusOrder = {
                '依頼中': 1,
                '作業完了': 2, // 確認待ち
                '確認完了': 3
            };

            const aOrder = statusOrder[a.status] || 999;
            const bOrder = statusOrder[b.status] || 999;

            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }

            // 同じステータスの場合は期限日順
            if (a.due_date && b.due_date) {
                return new Date(a.due_date) - new Date(b.due_date);
            }
            if (a.due_date) return -1;
            if (b.due_date) return 1;

            return 0;
        });
    }

    // マイタスクのソート改善（依頼中：確認待ち→依頼中）
    sortMyRequestedTasks(tasks) {
        return tasks.sort((a, b) => {
            const statusOrder = {
                '作業完了': 1, // 確認待ち
                '依頼中': 2,
                '確認完了': 3
            };

            const aOrder = statusOrder[a.status] || 999;
            const bOrder = statusOrder[b.status] || 999;

            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }

            // 同じステータスの場合は期限日順
            if (a.due_date && b.due_date) {
                return new Date(a.due_date) - new Date(b.due_date);
            }
            if (a.due_date) return -1;
            if (b.due_date) return 1;

            return 0;
        });
    }

    // 高機能履歴管理システム初期化
    setupHistoryManagement() {
        // 履歴ボタンイベント
        const historyToggle = document.getElementById('history-toggle');
        if (historyToggle) {
            historyToggle.addEventListener('click', () => this.toggleHistoryMode());
        }

        // 履歴パネルイベント
        const applyHistoryFilter = document.getElementById('apply-history-filter');
        const closeHistoryPanel = document.getElementById('close-history-panel');
        const historyPeriodSelect = document.getElementById('history-period-select');

        if (applyHistoryFilter) {
            applyHistoryFilter.addEventListener('click', () => this.applyHistoryFilter());
        }

        if (closeHistoryPanel) {
            closeHistoryPanel.addEventListener('click', () => this.closeHistoryPanel());
        }

        if (historyPeriodSelect) {
            historyPeriodSelect.addEventListener('change', (e) => {
                this.historyPeriod = e.target.value;
            });
        }

        // ローカルストレージから設定を復元
        this.loadHistorySettings();
    }

    // 履歴モードの切り替え
    toggleHistoryMode() {
        this.historyMode = !this.historyMode;
        const historyPanel = document.getElementById('history-panel');
        const historyToggle = document.getElementById('history-toggle');

        if (this.historyMode) {
            historyPanel.style.display = 'block';
            historyToggle.textContent = '📅 履歴モード終了';
            historyToggle.style.background = 'linear-gradient(135deg, #ff6b6b, #ff8e8e)';

            // 履歴データを読み込み
            this.loadHistoryData();
        } else {
            historyPanel.style.display = 'none';
            historyToggle.textContent = '📅 履歴表示';
            historyToggle.style.background = 'linear-gradient(135deg, #ffd700, #ffed4e)';

            // 通常モードに戻す
            this.updateDisplay();
        }
    }

    // 履歴パネルを閉じる
    closeHistoryPanel() {
        this.historyMode = false;
        const historyPanel = document.getElementById('history-panel');
        const historyToggle = document.getElementById('history-toggle');

        historyPanel.style.display = 'none';
        historyToggle.textContent = '📅 履歴表示';
        historyToggle.style.background = 'linear-gradient(135deg, #ffd700, #ffed4e)';

        this.updateDisplay();
    }

    // 履歴フィルターを適用
    async applyHistoryFilter() {
        if (!this.historyMode) return;

        try {
            await this.loadHistoryData();
            this.updateHistoryDisplay();
            this.saveHistorySettings();
            showToast('履歴フィルターを適用しました', 'success');
        } catch (error) {
            console.error('History filter error:', error);
            showToast('履歴フィルターの適用に失敗しました', 'error');
        }
    }

    // 履歴データを読み込み
    async loadHistoryData() {
        try {
            const today = new Date();
            let startDate = null;

            // 期間ごとの開始日を計算
            switch (this.historyPeriod) {
                case '7days':
                    startDate = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
                    break;
                case '30days':
                    startDate = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
                    break;
                case 'all':
                    startDate = null; // 全期間
                    break;
                case 'current':
                default:
                    // 現在のタスクのみ（既存のロジックを使用）
                    this.allTasks = [...this.tasks];
                    return;
            }

            // Supabaseから履歴データを取得
            let query = supabase
                .from('tasks')
                .select(`
                    *,
                    clients(id, name),
                    assignee:staffs!assignee_id(id, name, email),
                    requester:staffs!requester_id(id, name, email)
                `)
                .order('created_at', { ascending: false });

            if (startDate) {
                query = query.gte('created_at', startDate.toISOString());
            }

            const { data, error } = await query;

            if (error) throw error;

            this.allTasks = data || [];

        } catch (error) {
            console.error('Load history data error:', error);
            showToast('履歴データの読み込みに失敗しました', 'error');
        }
    }

    // 履歴表示を更新
    updateHistoryDisplay() {
        if (!this.historyMode) return;

        let filtered = [...this.allTasks];

        // 履歴表示では「確認完了」のみを表示（依頼中・確認待ちは除外）
        filtered = filtered.filter(task => task.status === '確認完了');

        // 担当者フィルター適用
        if (this.currentAssigneeFilter !== null) {
            filtered = filtered.filter(task => task.assignee_id === this.currentAssigneeFilter);
        }

        // その他のフィルター適用
        if (this.currentFilters.status) {
            filtered = filtered.filter(task => task.status === this.currentFilters.status);
        }

        if (this.currentFilters.client) {
            filtered = filtered.filter(task => task.client_id == this.currentFilters.client);
        }

        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            const normalizedSearch = normalizeText(this.currentFilters.search);

            filtered = filtered.filter(task => {
                const clientName = (task.client_id === 0 || task.client_id === null) ? 'その他業務' : (task.clients?.name || '');

                const basicMatch = task.task_name.toLowerCase().includes(search) ||
                                   clientName.toLowerCase().includes(search) ||
                                   (task.description || '').toLowerCase().includes(search);

                const normalizedMatch = normalizeText(task.task_name).includes(normalizedSearch) ||
                                        normalizeText(clientName).includes(normalizedSearch) ||
                                        normalizeText(task.description || '').includes(normalizedSearch);

                return basicMatch || normalizedMatch;
            });
        }

        // ソート適用
        filtered.sort((a, b) => {
            if (this.currentSort.field !== 'default_priority') {
                const field = this.currentSort.field;
                let aVal = a[field];
                let bVal = b[field];

                if (field === 'client_name') {
                    aVal = (a.client_id === 0 || a.client_id === null) ? 'その他業務' : (a.clients?.name || '');
                    bVal = (b.client_id === 0 || b.client_id === null) ? 'その他業務' : (b.clients?.name || '');
                } else if (field === 'assignee_name') {
                    aVal = a.assignee?.name || '';
                    bVal = b.assignee?.name || '';
                } else if (field === 'requester_name') {
                    aVal = a.requester?.name || '';
                    bVal = b.requester?.name || '';
                }

                if (aVal === null || aVal === undefined) aVal = '';
                if (bVal === null || bVal === undefined) bVal = '';

                const result = aVal > bVal ? 1 : -1;
                return this.currentSort.direction === 'asc' ? result : -result;
            }

            return this.getTaskPriorityScore(a) - this.getTaskPriorityScore(b);
        });

        // 表示更新（履歴モードでは確認完了タスクの数を表示）
        document.getElementById('total-task-count').textContent = `${filtered.length}件`;

        // タイトルを更新（履歴タスク管理に変更）
        this.updateTaskPanelTitle();

        if (this.currentDisplay === 'list') {
            this.updateListView(filtered);
        } else if (this.currentDisplay === 'card') {
            this.updateCardView(filtered);
        }
    }

    // 履歴設定をローカルストレージに保存
    saveHistorySettings() {
        const settings = {
            historyPeriod: this.historyPeriod
        };

        localStorage.setItem('task-history-settings', JSON.stringify(settings));
    }

    // 履歴設定をローカルストレージから読み込み
    loadHistorySettings() {
        try {
            const saved = localStorage.getItem('task-history-settings');
            if (saved) {
                const settings = JSON.parse(saved);

                this.historyPeriod = settings.historyPeriod || 'current';

                // UIを更新
                const historyPeriodSelect = document.getElementById('history-period-select');

                if (historyPeriodSelect) historyPeriodSelect.value = this.historyPeriod;
            }
        } catch (error) {
            console.error('Load history settings error:', error);
        }
    }
    // ===== 新しい3分割テンプレート管理機能 =====
    // 既存機能を破壊せずに新機能を追加

    openTemplateModalV2() {
        console.log('🚀 新しいテンプレートモーダルを開いています...');
        const modal = document.getElementById('template-modal');

        // 新しいUIかどうかをチェック
        const newUI = document.querySelector('.template-main-content');
        if (!newUI) {
            console.warn('⚠️ 新しいUI要素が見つかりません。従来のモーダルを使用します。');
            return this.openTemplateModal();
        }

        try {
            // 3分割テンプレートリストを生成
            this.renderTemplatesByTypeV2();

            // テンプレート数を更新
            this.updateTemplateCountV2();

            // イベントリスナーを設定
            this.setupTemplateModalEventsV2();

            modal.style.display = 'block';
            this.setUserInteracting(true);

            // タブナビゲーションを無効化
            this.disableTabNavigation(true);

            console.log('✅ 新しいテンプレートモーダルが正常に開かれました');
        } catch (error) {
            console.error('❌ 新しいテンプレートモーダルでエラー:', error);
            // フォールバック: 従来のモーダルを使用
            return this.openTemplateModal();
        }
    }

    renderTemplatesByTypeV2() {
        console.log('📋 テンプレートをタイプ別にレンダリング中...');

        // 月次自動タスク（左側）
        this.renderRecurringTasksV2();

        // 個別テンプレート（中央）
        this.renderPersonalTemplatesV2();

        // 共有テンプレート（右側）
        this.renderGlobalTemplatesV2();

        console.log('✅ テンプレートのレンダリングが完了しました');
    }

    renderRecurringTasksV2() {
        const container = document.getElementById('recurring-templates-list');
        if (!container) {
            console.warn('⚠️ recurring-templates-list要素が見つかりません');
            return;
        }

        // データベースで既にフィルタリング済みなので、そのまま表示
        const recurringTasks = this.recurringTasks;

        if (recurringTasks.length === 0) {
            container.innerHTML = `
                <div class="template-list-empty">
                    まだ月次自動タスクがありません<br>
                    「新規作成」ボタンから設定しましょう
                </div>
            `;
            return;
        }

        // display_orderでソート（昇順）、display_orderがない場合は作成日でソート
        recurringTasks.sort((a, b) => {
            const aOrder = a.display_order ?? 999999;
            const bOrder = b.display_order ?? 999999;
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            // display_orderが同じ場合は作成日でソート（新しい順）
            return new Date(b.created_at) - new Date(a.created_at);
        });

        // 各月次自動タスクをレンダリング
        container.innerHTML = '';
        recurringTasks.forEach(task => {
            const taskElement = this.createRecurringTaskElementV2(task);
            container.appendChild(taskElement);
        });

        console.log(`✅ 月次自動タスク ${recurringTasks.length}件を表示しました`);

        // ドラッグ&ドロップ機能を初期化（display_order列が存在する場合のみ）
        // 注意: display_order列がDBに存在しない場合はコメントアウト
        // this.initializeSortable(container, 'recurring');
    }

    createRecurringTaskElementV2(recurringTask) {
        const element = document.createElement('div');
        element.className = 'template-item recurring-task';
        element.dataset.recurringId = recurringTask.id;
        element.dataset.templateId = recurringTask.id; // ソート処理で使用
        element.dataset.templateType = 'recurring';

        // 月次自動タスクの情報を準備
        const templateName = recurringTask.task_name || '未設定';
        const clientName = recurringTask.client?.name || '全事業者';
        const frequencyText = `毎月${recurringTask.frequency_day}日`;
        const nextRunDate = recurringTask.next_run_date ?
            new Date(recurringTask.next_run_date).toLocaleDateString('ja-JP') : '未設定';

        element.innerHTML = `
            <div class="template-compact-layout">
                <!-- 1行目：タイトル行 -->
                <div class="template-header-row">
                    <div class="template-name">
                        <!-- ドラッグハンドル（display_order列が存在する場合のみ表示） -->
                        <!-- <span class="drag-handle" title="ドラッグして並び替え">⋮⋮</span> -->
                        <span class="template-type">🔄</span>
                        <span class="template-title">${templateName}</span>
                    </div>
                    <div class="template-actions">
                        <button class="template-edit-btn"
                                data-recurring-id="${recurringTask.id}"
                                title="編集">
                            ✏️
                        </button>
                        <button class="template-delete-btn"
                                data-recurring-id="${recurringTask.id}"
                                title="削除">
                            🗑️
                        </button>
                    </div>
                </div>
                <!-- 2行目：詳細情報行 -->
                <div class="template-details-row">
                    <div class="template-info">
                        👥 ${clientName} • ⏰ ${frequencyText}
                    </div>
                    <div class="template-meta">
                        <span class="template-next-run">📅 次回: ${nextRunDate}</span>
                        <span class="template-status ${recurringTask.is_active ? 'active' : 'inactive'}">
                            ${recurringTask.is_active ? '✅ 有効' : '⏸️ 無効'}
                        </span>
                    </div>
                </div>
            </div>
        `;

        // クリックイベントハンドリング
        element.addEventListener('click', (e) => {
            const target = e.target;

            // 編集ボタンクリック
            if (target.classList.contains('template-edit-btn')) {
                e.stopPropagation();
                this.openRecurringTaskEditModal(recurringTask, 'edit');
                return;
            }

            // 削除ボタンクリック
            if (target.classList.contains('template-delete-btn')) {
                e.stopPropagation();
                this.deleteRecurringTask(recurringTask.id);
                return;
            }

            // その他のクリック（編集モード）
            if (!target.closest('.template-actions')) {
                this.openRecurringTaskEditModal(recurringTask, 'edit');
            }
        });

        return element;
    }

    // 月次自動タスク編集モーダル
    openRecurringTaskEditModal(recurringTask = null, mode = 'create') {
        console.log(`🔄 月次自動タスク編集モーダルを開く: mode=${mode}`);

        const modal = document.getElementById('template-edit-modal');
        if (!modal) {
            console.error('❌ template-edit-modal要素が見つかりません');
            return;
        }

        // 現在の月次自動タスク情報を保存
        this.currentRecurringTask = recurringTask;
        this.currentTemplateType = 'recurring';

        // フォームをリセット
        const form = document.getElementById('template-edit-form');
        if (form) {
            form.reset();
        }

        // モードに応じてUI更新
        this.setRecurringTaskEditMode(mode, recurringTask);

        // 編集モードの場合、フォームにデータを入力
        if (mode !== 'create' && recurringTask) {
            // 検索可能ドロップダウンが初期化されていることを確認
            if (!this.templateClientSelect) {
                this.initializeTemplateClientSelect();
            }
            this.populateRecurringTaskForm(recurringTask);
        }

        modal.style.display = 'block';
        this.setUserInteracting(true);

        // タブナビゲーションを無効化
        this.disableTabNavigation(true);

        console.log('✅ 月次自動タスク編集モーダルが開かれました');
    }

    populateRecurringTaskForm(recurringTask) {
        if (!recurringTask) return;

        console.log('📝 月次タスクフォームにデータを入力:', recurringTask);

        const setFieldValue = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value || '';
                console.log(`Set ${id} = ${value}`);
            } else {
                console.warn(`Element not found: ${id}`);
            }
        };

        // 基本情報（recurring_tasksテーブルから直接）
        setFieldValue('template-name-input', '月次自動タスク'); // 固定値
        setFieldValue('template-task-name', recurringTask.task_name);
        setFieldValue('template-estimated-hours', recurringTask.estimated_time_hours);
        setFieldValue('template-reference-url', recurringTask.reference_url);
        setFieldValue('template-priority', recurringTask.priority || 2);

        // 月次タスク設定
        setFieldValue('template-due-day', recurringTask.due_day);
        setFieldValue('template-create-days-before', recurringTask.create_days_before);

        // 受託者設定
        if (recurringTask.assignee_id) {
            const assigneeSelect = document.getElementById('template-default-assignee');
            if (assigneeSelect) {
                assigneeSelect.value = recurringTask.assignee_id;
            }
        }

        // 事業者設定（検索可能ドロップダウン）
        if (recurringTask.client_id) {
            const client = this.clients.find(c => c.id === recurringTask.client_id);
            console.log(`Setting client: ${recurringTask.client_id}, found client:`, client);
            console.log('templateClientSelect state:', this.templateClientSelect);

            if (client) {
                // 検索可能ドロップダウンが利用可能な場合
                if (this.templateClientSelect && typeof this.templateClientSelect.setValue === 'function') {
                    console.log('Using templateClientSelect.setValue');
                    this.templateClientSelect.setValue(recurringTask.client_id);
                } else {
                    console.log('Using fallback: direct select element');
                    // フォールバック：直接select要素に設定
                    const clientSelect = document.getElementById('template-client-select');
                    if (clientSelect) {
                        clientSelect.value = recurringTask.client_id;
                    }
                }

                // 検索入力欄にも事業者名を設定
                const searchInput = document.getElementById('template-client-search');
                if (searchInput) {
                    searchInput.value = client.name;
                }
            }
        }
    }

    setRecurringTaskEditMode(mode, recurringTask) {
        const title = document.getElementById('template-edit-title');
        const typeIndicator = document.getElementById('template-type-text');
        const recurringSettings = document.getElementById('recurring-settings');
        const viewButtons = document.getElementById('template-view-mode-buttons');
        const editButtons = document.getElementById('template-edit-mode-buttons');

        // タイトル更新
        if (title) {
            title.textContent = mode === 'create' ?
                '新規月次自動タスク作成' :
                `${recurringTask?.template?.template_name || '月次自動タスク'} - 編集`;
        }

        // タイプ表示更新
        if (typeIndicator) {
            typeIndicator.textContent = '🔄 月次自動タスク';
        }

        // 月次自動タスク設定を表示
        if (recurringSettings) {
            recurringSettings.style.display = 'block';
        }

        // 月次自動タスク用と一般用の既定の受託者フィールドを切り替え
        const defaultAssigneeRow = document.getElementById('template-default-assignee-row');
        if (defaultAssigneeRow) {
            defaultAssigneeRow.style.display = 'none'; // 月次自動タスクでは非表示
        }

        // 月次自動タスクモード時のテンプレート名フィールド制御
        const templateNameInput = document.getElementById('template-name-input');
        if (templateNameInput) {
            templateNameInput.value = '月次自動タスク';
            templateNameInput.readOnly = true;
            templateNameInput.style.backgroundColor = '#f8f9fa';
            templateNameInput.style.color = '#6c757d';
            templateNameInput.title = '月次自動タスクのテンプレート名は固定です';
        }

        // 月次自動タスクの場合はテンプレート名のみ表示、他は非表示
        const sectionsToShow = ['template-basic-section'];
        const sectionsToHide = ['template-description-section'];

        sectionsToShow.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
            }
        });

        sectionsToHide.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            }
        });

        // ボタン表示切り替え
        if (viewButtons && editButtons) {
            if (mode === 'view') {
                viewButtons.style.display = 'flex';
                editButtons.style.display = 'none';
            } else {
                viewButtons.style.display = 'none';
                editButtons.style.display = 'flex';
            }
        }

        // 新規作成時のデフォルト値設定
        if (mode === 'create') {
            this.setRecurringTaskDefaults();
        }
    }


    setRecurringTaskDefaults() {
        // 受託者を現在のユーザーに設定
        const assigneeSelect = document.getElementById('template-default-assignee');
        if (assigneeSelect && this.currentUser) {
            assigneeSelect.value = this.currentUser.id;
        }

        // デフォルト値設定
        const dueDaySelect = document.getElementById('template-due-day');
        if (dueDaySelect) {
            dueDaySelect.value = '25'; // 月末近くをデフォルト
        }

        const createBeforeSelect = document.getElementById('template-create-days-before');
        if (createBeforeSelect) {
            createBeforeSelect.value = '3'; // 3日前をデフォルト
        }
    }

    // 月次自動タスクの削除
    async deleteRecurringTask(recurringId) {
        if (!confirm('この月次自動タスクを削除しますか？\n削除後は復元できません。')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('recurring_tasks')
                .delete()
                .eq('id', recurringId);

            if (error) throw error;

            showToast('月次自動タスクを削除しました', 'success');

            // データを再読み込みして表示を更新
            await this.loadRecurringTasks();
            this.renderRecurringTasksV2();

        } catch (error) {
            console.error('❌ 月次自動タスク削除エラー:', error);
            showToast('月次自動タスクの削除に失敗しました', 'error');
        }
    }

    // 月次自動タスクの保存（新規作成・編集）
    async saveRecurringTask() {
        console.log('🔄 saveRecurringTask() called');
        try {
            // フォームデータを取得
            const formData = this.getRecurringTaskFormData();
            console.log('📋 Form data:', formData);

            if (!formData) {
                console.warn('⚠️ Form validation failed');
                return; // バリデーションエラー
            }

            // recurring_tasksテーブルに直接保存（template_id不要）
            const recurringData = {
                client_id: formData.client_id,
                assignee_id: formData.assignee_id,
                frequency_type: formData.frequency_type,
                frequency_day: formData.frequency_day,
                due_day: formData.due_day,
                create_days_before: formData.create_days_before,
                is_active: formData.is_active,
                next_run_date: formData.next_run_date,
                // 新しく追加されたカラム
                task_name: formData.task_name,
                description: formData.description,
                estimated_time_hours: formData.estimated_time_hours,
                reference_url: formData.reference_url,
                priority: formData.priority || 2,
                // ユーザー識別用
                created_by_email: this.currentUser.email
            };

            // 新規作成時のみdisplay_orderを設定
            // 注意: display_order列がDBに存在しない場合はコメントアウト
            // if (!this.currentRecurringTask) {
            //     const userRecurringTasks = this.recurringTasks.filter(task =>
            //         task.template?.staff_id === this.currentUser?.id && task.is_active
            //     );
            //     const maxOrder = Math.max(...userRecurringTasks.map(t => t.display_order || 0), 0);
            //     recurringData.display_order = maxOrder + 1;
            // }

            let result;
            if (this.currentRecurringTask) {
                // 編集
                result = await supabase
                    .from('recurring_tasks')
                    .update(recurringData)
                    .eq('id', this.currentRecurringTask.id);
            } else {
                // 新規作成
                result = await supabase
                    .from('recurring_tasks')
                    .insert([recurringData]);
            }

            if (result.error) throw result.error;

            const action = this.currentRecurringTask ? '更新' : '作成';
            showToast(`月次自動タスクを${action}しました`, 'success');

            // データを再読み込みして表示を更新
            await this.loadRecurringTasks();
            this.renderRecurringTasksV2();

            // モーダルを閉じる
            this.closeTemplateEditModal();

        } catch (error) {
            console.error('❌ 月次自動タスク保存エラー:', error);
            showToast('月次自動タスクの保存に失敗しました', 'error');
        }
    }

    getRecurringTaskFormData() {
        console.log('📝 Getting recurring task form data...');

        // テンプレート名
        const templateNameElement = document.getElementById('template-name-input');
        const templateName = templateNameElement?.value?.trim();
        console.log('📝 Template name element:', templateNameElement, 'value:', templateName);

        if (!templateName) {
            showToast('テンプレート名を入力してください', 'error');
            return null;
        }

        // 期限日
        const dueDayElement = document.getElementById('template-due-day');
        const dueDay = dueDayElement?.value;
        console.log('📅 Due day element:', dueDayElement, 'value:', dueDay);

        if (!dueDay) {
            showToast('期限日を選択してください', 'error');
            return null;
        }

        // 何日前に作成
        const createDaysBefore = document.getElementById('template-create-days-before')?.value;
        if (!createDaysBefore) {
            showToast('作成日を選択してください', 'error');
            return null;
        }

        // 担当者
        const assigneeId = document.getElementById('template-default-assignee')?.value;
        if (!assigneeId) {
            showToast('担当者を選択してください', 'error');
            return null;
        }

        // 事業者ID（月次タスクでも事業者を指定可能）
        const clientId = parseInt(document.getElementById('template-client-select')?.value) || null;

        // 参照URL（オプション）
        const referenceUrl = document.getElementById('template-reference-url')?.value?.trim() || null;

        // 想定時間（オプション）
        const estimatedTimeHours = document.getElementById('template-estimated-hours')?.value?.trim() || null;

        // frequency_dayを計算（タスク作成日 = 期限日 - 作成日数前）
        const frequencyDay = parseInt(dueDay) - parseInt(createDaysBefore);

        // 有効な日付範囲をチェック（1-28日の範囲で）
        if (frequencyDay < 1 || frequencyDay > 28) {
            showToast('期限日と作成日数の組み合わせが無効です（作成日は1-28日の範囲で設定してください）', 'error');
            return null;
        }

        // 次回実行日を計算（来月の作成日）
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(frequencyDay);

        // タスク名と説明を取得
        const taskName = document.getElementById('template-task-name')?.value?.trim();
        const description = document.getElementById('template-description')?.value?.trim();
        const priority = parseInt(document.getElementById('template-priority')?.value) || 2;

        const formData = {
            template_name: '月次自動タスク', // 固定値
            task_name: taskName, // 新規追加
            description: description, // 新規追加
            priority: priority, // 新規追加
            client_id: clientId, // 事業者指定（nullの場合は全事業者対象）
            reference_url: referenceUrl, // 参照URL
            estimated_time_hours: estimatedTimeHours, // 想定時間
            default_assignee_id: parseInt(assigneeId), // 既定の受託者
            assignee_id: parseInt(assigneeId),
            frequency_type: 'monthly',
            frequency_day: frequencyDay, // タスク作成日
            due_day: parseInt(dueDay), // 期限日
            create_days_before: parseInt(createDaysBefore), // 何日前に作成
            is_active: true,
            next_run_date: nextMonth.toISOString().split('T')[0]
        };

        return formData;
    }

    renderPersonalTemplatesV2() {
        const container = document.getElementById('personal-templates-list');
        if (!container) {
            console.warn('⚠️ personal-templates-list要素が見つかりません');
            return;
        }

        const personalTemplates = this.templates.filter(template =>
            !template.is_global &&
            (template.staff_id === this.currentUser?.id || !template.staff_id)
        );

        if (personalTemplates.length === 0) {
            container.innerHTML = `
                <div class="template-list-empty">
                    まだ個別テンプレートがありません<br>
                    「新規作成」ボタンからテンプレートを作成しましょう
                </div>
            `;
            return;
        }

        // お気に入りでソート → display_orderでソート → 作成日でソート
        personalTemplates.sort((a, b) => {
            if (a.is_favorite && !b.is_favorite) return -1;
            if (!a.is_favorite && b.is_favorite) return 1;

            // display_orderでソート（0は最後に）
            const orderA = a.display_order || 9999;
            const orderB = b.display_order || 9999;
            if (orderA !== orderB) return orderA - orderB;

            // 最後に作成日でソート
            return new Date(b.created_at) - new Date(a.created_at);
        });

        container.innerHTML = '';
        personalTemplates.forEach(template => {
            const templateElement = this.createTemplateElementV2(template, 'personal');
            container.appendChild(templateElement);
        });

        // ドラッグ&ドロップ機能を初期化
        this.initializeSortable(container, 'personal');

        console.log(`✅ 個別テンプレート ${personalTemplates.length}件を表示しました`);
    }

    renderGlobalTemplatesV2() {
        const container = document.getElementById('global-templates-list');
        if (!container) {
            console.warn('⚠️ global-templates-list要素が見つかりません');
            return;
        }

        const globalTemplates = this.templates.filter(template => template.is_global);

        if (globalTemplates.length === 0) {
            container.innerHTML = `
                <div class="template-list-empty">
                    まだ共有テンプレートがありません<br>
                    「新規作成」ボタンから共通テンプレートを作成しましょう
                </div>
            `;
            return;
        }

        // お気に入りでソート → display_orderでソート → 作成日でソート
        globalTemplates.sort((a, b) => {
            if (a.is_favorite && !b.is_favorite) return -1;
            if (!a.is_favorite && b.is_favorite) return 1;

            // display_orderでソート（0は最後に）
            const orderA = a.display_order || 9999;
            const orderB = b.display_order || 9999;
            if (orderA !== orderB) return orderA - orderB;

            // 最後に作成日でソート
            return new Date(b.created_at) - new Date(a.created_at);
        });

        container.innerHTML = '';
        globalTemplates.forEach(template => {
            const templateElement = this.createTemplateElementV2(template, 'global');
            container.appendChild(templateElement);
        });

        // ドラッグ&ドロップ機能を初期化
        this.initializeSortable(container, 'global');

        console.log(`✅ 共有テンプレート ${globalTemplates.length}件を表示しました`);
    }

    createTemplateElementV2(template, type) {
        const element = document.createElement('div');
        element.className = `template-item ${template.is_favorite ? 'favorite' : ''}`;
        element.dataset.templateId = template.id;
        element.dataset.templateType = type;

        const typeIcon = type === 'personal' ? '👤' : '🌐';
        const priorityStars = '⭐'.repeat(template.priority || 1);

        // コンパクト表示用のデータ準備
        const taskInfo = template.task_name || '';
        const description = template.description || '';

        // client_idから事業者名を取得
        let clientName = '';
        if (template.client_id) {
            const client = this.clients.find(c => c.id === template.client_id);
            clientName = client ? client.name : '';
        }

        let displayText = '';
        if (clientName) {
            displayText = `👥 ${clientName}`;
            if (taskInfo) displayText += ` • ${taskInfo}`;
            if (description) displayText += ` • ${description.substring(0, 30)}${description.length > 30 ? '...' : ''}`;
        } else if (taskInfo && description) {
            displayText = `${taskInfo} • ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`;
        } else {
            displayText = taskInfo || description.substring(0, 80) + (description.length > 80 ? '...' : '');
        }

        element.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <div class="template-compact-layout">
                <!-- 1行目：タイトル行 -->
                <div class="template-header-row">
                    <div class="template-name">
                        <span class="template-type">${typeIcon}</span>
                        <span class="template-title">${template.template_name}</span>
                    </div>
                    <div class="template-actions">
                        <button class="favorite-btn ${template.is_favorite ? 'active' : ''}"
                                data-template-id="${template.id}"
                                title="${template.is_favorite ? 'お気に入りを解除' : 'お気に入りに追加'}">
                            📌
                        </button>
                        <button class="template-edit-btn"
                                data-template-id="${template.id}"
                                title="編集">
                            ✏️
                        </button>
                    </div>
                </div>
                <!-- 2行目：詳細情報行 -->
                <div class="template-details-row">
                    <div class="template-info">
                        ${displayText ? `💼 ${displayText}` : '💼 詳細なし'}
                    </div>
                    <div class="template-meta">
                        <span class="template-priority">${priorityStars}</span>
                        <span class="template-time">⏱️ ${template.estimated_time_hours || '未設定'}h</span>
                    </div>
                </div>
            </div>
        `;

        // クリックイベントハンドリング
        element.addEventListener('click', (e) => {
            const target = e.target;

            // お気に入りボタンのクリック
            if (target.classList.contains('favorite-btn')) {
                e.stopPropagation();
                this.toggleTemplateFavorite(template);
                return;
            }

            // 編集ボタンのクリック
            if (target.classList.contains('template-edit-btn')) {
                e.stopPropagation();
                this.openTemplateEditModalV2(template, 'edit');
                return;
            }

            // ドラッグハンドルやボタン以外のクリック（詳細表示）
            if (!target.classList.contains('drag-handle') &&
                !target.closest('.template-actions')) {
                this.openTemplateEditModalV2(template, 'view');
            }
        });

        return element;
    }

    updateTemplateCountV2() {
        const totalCount = this.templates.length;
        const countElement = document.getElementById('template-count-info');
        if (countElement) {
            countElement.textContent = `📊 総テンプレート数: ${totalCount}`;
        }
    }

    setupTemplateModalEventsV2() {
        console.log('⚙️ 新しいテンプレートモーダルのイベントリスナーを設定中...');

        // 新規作成ボタン
        const addButtons = document.querySelectorAll('.template-add-btn');
        addButtons.forEach(btn => {
            // 既存のイベントリスナーを削除して新しく設定
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                console.log(`📝 新規${type}テンプレート作成をクリック`);

                if (type === 'recurring') {
                    this.openRecurringTaskEditModal(null, 'create');
                } else {
                    this.openTemplateEditModalV2(null, 'create', type);
                }
            });
        });

        // 閉じるボタン
        this.setupSafeEventListener('template-modal-close', 'click', () => {
            this.closeTemplateModal();
        });

        this.setupSafeEventListener('template-cancel-btn', 'click', () => {
            this.closeTemplateModal();
        });

        // ヘルプボタン
        this.setupSafeEventListener('template-help-btn', 'click', () => {
            this.showTemplateHelpV2();
        });

        console.log('✅ イベントリスナーの設定が完了しました');
    }

    setupSafeEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            // 既存のイベントリスナーを削除
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
            // 新しいイベントリスナーを追加
            newElement.addEventListener(event, handler);
        } else {
            console.warn(`⚠️ 要素 ${elementId} が見つかりません`);
        }
    }

    openTemplateEditModalV2(template = null, mode = 'create', type = 'personal') {
        console.log(`📝 テンプレート編集モーダルを開く: mode=${mode}, type=${type}`);

        const modal = document.getElementById('template-edit-modal');
        if (!modal) {
            console.error('❌ template-edit-modal要素が見つかりません');
            return;
        }

        // テンプレートが存在する場合、そのis_globalフィールドからタイプを自動判定
        let actualType = type;
        if (template) {
            actualType = template.is_global ? 'global' : 'personal';
        }

        // 現在のテンプレート情報を保存
        this.currentTemplate = template;
        this.currentTemplateType = actualType;

        // フォームをリセット
        const form = document.getElementById('template-edit-form');
        if (form) {
            form.reset();
        }

        // モードに応じてUI更新
        this.setTemplateEditModeV2(mode, template, actualType);

        modal.style.display = 'block';
        this.setUserInteracting(true);

        // タブナビゲーションを無効化
        this.disableTabNavigation(true);

        console.log('✅ テンプレート編集モーダルが開かれました');
    }

    setTemplateEditModeV2(mode, template, type) {
        const title = document.getElementById('template-edit-title');
        const typeIndicator = document.getElementById('template-type-text');
        const recurringSettings = document.getElementById('recurring-settings');
        const viewButtons = document.getElementById('template-view-mode-buttons');
        const editButtons = document.getElementById('template-edit-mode-buttons');

        // タイトル更新
        if (title) {
            title.textContent = mode === 'create' ?
                `新規${this.getTypeDisplayName(type)}作成` :
                `${template?.template_name || 'テンプレート'} - ${this.getTypeDisplayName(type)}`;
        }

        // タイプ表示更新
        if (typeIndicator) {
            typeIndicator.textContent = `${this.getTypeIcon(type)} ${this.getTypeDisplayName(type)}`;
        }

        // 月次自動タスク設定の表示/非表示
        if (recurringSettings) {
            recurringSettings.style.display = type === 'recurring' ? 'block' : 'none';
        }

        // 一般用の既定の受託者フィールドの表示/非表示
        const defaultAssigneeRow = document.getElementById('template-default-assignee-row');
        if (defaultAssigneeRow) {
            defaultAssigneeRow.style.display = type === 'recurring' ? 'none' : 'block';
        }

        // 月次自動タスクモード時のテンプレート名フィールド制御
        const templateNameInput = document.getElementById('template-name-input');
        if (templateNameInput) {
            if (type === 'recurring') {
                templateNameInput.value = '月次自動タスク';
                templateNameInput.readOnly = true;
                templateNameInput.style.backgroundColor = '#f8f9fa';
                templateNameInput.style.color = '#6c757d';
                templateNameInput.title = '月次自動タスクのテンプレート名は固定です';
            } else {
                templateNameInput.readOnly = false;
                templateNameInput.style.backgroundColor = '';
                templateNameInput.style.color = '';
                templateNameInput.title = '';
            }
        }

        // ボタン表示切り替え
        if (viewButtons && editButtons) {
            if (mode === 'view') {
                viewButtons.style.display = 'flex';
                editButtons.style.display = 'none';
                this.populateTemplateFormV2(template);
                this.setFormReadOnlyV2(true);
            } else {
                viewButtons.style.display = 'none';
                editButtons.style.display = 'flex';
                if (template) {
                    this.populateTemplateFormV2(template);
                }
                this.setFormReadOnlyV2(false);
            }
        }
    }

    getTypeDisplayName(type) {
        const names = {
            'recurring': '月次自動タスク',
            'personal': '個別テンプレート',
            'global': '共有テンプレート'
        };
        return names[type] || '不明なタイプ';
    }

    getTypeIcon(type) {
        const icons = {
            'recurring': '🔄',
            'personal': '👤',
            'global': '🌐'
        };
        return icons[type] || '📋';
    }

    populateTemplateFormV2(template) {
        if (!template) return;

        const setFieldValue = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value || '';
            }
        };

        const setCheckboxValue = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.checked = !!value;
            }
        };

        // 基本情報
        setFieldValue('template-name-input', template.template_name);
        setFieldValue('template-task-name', template.task_name);
        setFieldValue('template-priority', template.priority || 1);
        setFieldValue('template-estimated-hours', template.estimated_time_hours);
        setFieldValue('template-description', template.description);
        setFieldValue('template-reference-url', template.reference_url);
        setFieldValue('template-default-assignee-general', template.default_assignee_id);

        // 事業者選択（検索可能ドロップダウン用）
        if (template.client_id && this.templateClientSelect) {
            const client = this.clients.find(c => c.id === template.client_id);
            if (client) {
                this.templateClientSelect.selectItem(client.id.toString(), client.name);
            }
        } else if (this.templateClientSelect) {
            this.templateClientSelect.clear();
        }

        // お気に入り
        setCheckboxValue('template-is-favorite', template.is_favorite);
    }

    setFormReadOnlyV2(readOnly) {
        const form = document.getElementById('template-edit-form');
        if (!form) return;

        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.readOnly = readOnly;
            input.disabled = readOnly;
        });
    }

    // 月次自動タスクの並び替え処理
    async handleRecurringTaskSort(evt, newIndex, oldIndex) {
        const recurringId = evt.item.dataset.recurringId;

        try {
            // データベースで既にユーザー別フィルタリング済み
            const userRecurringTasks = this.recurringTasks;

            // display_orderを再計算
            const reorderedTasks = [];
            userRecurringTasks.forEach((task, index) => {
                let newDisplayOrder;
                if (task.id == recurringId) {
                    // 移動したアイテム
                    newDisplayOrder = newIndex;
                } else if (index < oldIndex && index >= newIndex) {
                    // 上に移動した場合、間のアイテムは下にずれる
                    newDisplayOrder = index + 1;
                } else if (index > oldIndex && index <= newIndex) {
                    // 下に移動した場合、間のアイテムは上にずれる
                    newDisplayOrder = index - 1;
                } else {
                    // その他は現在位置を維持
                    newDisplayOrder = index;
                }

                reorderedTasks.push({
                    id: task.id,
                    display_order: newDisplayOrder
                });
            });

            // データベースを更新
            for (const item of reorderedTasks) {
                const { error } = await supabase
                    .from('recurring_tasks')
                    .update({ display_order: item.display_order })
                    .eq('id', item.id);

                if (error) throw error;
            }

            console.log('✅ 月次自動タスクの並び替えが完了しました');

            // データを再読み込み
            await this.loadRecurringTasks();
            this.renderRecurringTasksV2();

        } catch (error) {
            console.error('❌ 月次自動タスク並び替えエラー:', error);
            showToast('並び替えに失敗しました', 'error');

            // エラー時は元に戻す
            await this.loadRecurringTasks();
            this.renderRecurringTasksV2();
        }
    }

    showTemplateHelpV2() {
        const helpText = `
📋 テンプレート管理システムの使い方

🔄 月次自動タスク作成
・毎月自動で作成されるタスクを設定
・指定した日付の指定日数前に自動作成

👤 個別テンプレート
・あなた専用のテンプレート
・よく使用するタスクをテンプレート化

🌐 共有テンプレート
・全員が使用できる共通テンプレート
・標準的な作業をテンプレート化

⭐ お気に入り機能
・よく使うテンプレートを上位表示
・ドラッグ&ドロップで並び替え可能
        `;

        alert(helpText);
    }

    // テンプレート編集モーダルのイベントリスナーを設定
    setupTemplateEditModalEvents() {
        console.log('⚙️ テンプレート編集モーダルのイベントリスナーを設定中...');

        // テンプレート編集モーダルの要素確認
        const templateEditModal = document.getElementById('template-edit-modal');
        if (!templateEditModal) {
            console.warn('⚠️ template-edit-modal要素が見つかりません');
            return;
        }

        // 閉じるボタン
        this.setupSafeEventListener('template-edit-close', 'click', () => {
            this.closeTemplateEditModal();
        });

        // 閲覧モードボタン
        this.setupSafeEventListener('template-close-view-btn', 'click', () => {
            this.closeTemplateEditModal();
        });

        this.setupSafeEventListener('template-edit-mode-btn', 'click', () => {
            if (this.currentTemplateType === 'recurring' && this.currentRecurringTask) {
                // 月次タスクの場合
                this.setRecurringTaskEditMode('edit', this.currentRecurringTask);
                // フォームにデータを入力
                if (!this.templateClientSelect) {
                    this.initializeTemplateClientSelect();
                }
                this.populateRecurringTaskForm(this.currentRecurringTask);
                this.setFormReadOnlyV2(false);
            } else if (this.currentTemplate) {
                // 通常のテンプレートの場合
                this.setTemplateEditModeV2('edit', this.currentTemplate, this.currentTemplateType);
            } else {
                console.warn('⚠️ currentTemplate/currentRecurringTask is null, cannot switch to edit mode');
            }
        });

        this.setupSafeEventListener('template-use-btn', 'click', () => {
            if (this.currentTemplate) {
                this.useTemplateForTask(this.currentTemplate);
            } else {
                console.warn('⚠️ currentTemplate is null, cannot use template');
            }
        });

        // 編集モードボタン
        this.setupSafeEventListener('template-cancel-edit-btn', 'click', () => {
            this.closeTemplateEditModal();
        });

        this.setupSafeEventListener('template-save-btn', 'click', () => {
            if (this.currentTemplateType === 'recurring') {
                this.saveRecurringTask();
            } else {
                this.saveTemplateV2();
            }
        });

        this.setupSafeEventListener('template-delete-btn', 'click', () => {
            this.deleteTemplateV2();
        });

        console.log('✅ テンプレート編集モーダルのイベントリスナー設定完了');
    }

    closeTemplateEditModal() {
        const modal = document.getElementById('template-edit-modal');
        if (modal) {
            modal.style.display = 'none';
            this.setUserInteracting(false);
        }
        // 現在のテンプレート情報をクリア
        this.currentTemplate = null;
        this.currentTemplateType = null;
        this.currentRecurringTask = null; // 月次タスク情報もクリア

        // フォームのreadOnly状態をリセット
        this.setFormReadOnlyV2(false);

        // タブナビゲーションを再有効化
        this.disableTabNavigation(false);
    }

    useTemplateForTask(template) {
        if (!template) return;

        // テンプレート編集モーダルを閉じる
        this.closeTemplateEditModal();
        // テンプレートモーダルを閉じる
        this.closeTemplateModal();

        // テンプレートデータでタスクモーダルを開く
        this.openTaskModal(null, template);
    }

    async saveTemplateV2() {
        console.log('💾 テンプレートを保存中...');

        try {
            const formData = this.getTemplateFormDataV2();
            if (!formData) {
                showToast('入力内容を確認してください', 'error');
                return;
            }

            let result;
            if (this.currentTemplate?.id) {
                // 更新
                result = await this.updateTemplateV2(this.currentTemplate.id, formData);
            } else {
                // 新規作成
                result = await this.createTemplateV2(formData);
            }

            if (result.success) {
                showToast('テンプレートを保存しました', 'success');
                await this.loadTemplates(); // テンプレート再読み込み
                this.closeTemplateEditModal();

                // テンプレートモーダルが開いている場合は更新
                const templateModal = document.getElementById('template-modal');
                if (templateModal && templateModal.style.display !== 'none') {
                    this.renderTemplatesByTypeV2();
                }
            } else {
                showToast(result.error || 'テンプレートの保存に失敗しました', 'error');
            }

        } catch (error) {
            console.error('❌ テンプレート保存エラー:', error);
            showToast('テンプレートの保存中にエラーが発生しました', 'error');
        }
    }

    getTemplateFormDataV2() {
        const templateName = document.getElementById('template-name-input')?.value?.trim();
        const taskName = document.getElementById('template-task-name')?.value?.trim();

        if (!templateName || !taskName) {
            console.warn('⚠️ 必須項目が入力されていません');
            return null;
        }

        return {
            template_name: templateName,
            task_name: taskName,
            priority: parseInt(document.getElementById('template-priority')?.value) || 1,
            estimated_time_hours: parseFloat(document.getElementById('template-estimated-hours')?.value) || null,
            description: document.getElementById('template-description')?.value?.trim() || '',
            client_id: parseInt(document.getElementById('template-client-select')?.value) || null,
            reference_url: document.getElementById('template-reference-url')?.value?.trim() || null,
            default_assignee_id: parseInt(document.getElementById('template-default-assignee-general')?.value) || null,
            is_favorite: document.getElementById('template-is-favorite')?.checked || false,
            is_global: this.currentTemplateType === 'global',
            staff_id: this.currentTemplateType === 'personal' ? this.currentUser?.id : null
        };
    }

    async createTemplateV2(templateData) {
        try {
            const { data, error } = await supabase
                .from('task_templates')
                .insert([templateData])
                .select()
                .single();

            if (error) throw error;

            return { success: true, data };
        } catch (error) {
            console.error('❌ テンプレート作成エラー:', error);
            return { success: false, error: error.message };
        }
    }

    async updateTemplateV2(templateId, templateData) {
        try {
            const { data, error } = await supabase
                .from('task_templates')
                .update(templateData)
                .eq('id', templateId)
                .select()
                .single();

            if (error) throw error;

            return { success: true, data };
        } catch (error) {
            console.error('❌ テンプレート更新エラー:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteTemplateV2() {
        if (!this.currentTemplate?.id) {
            console.warn('⚠️ 削除対象のテンプレートが選択されていません');
            return;
        }

        try {
            // まず月次自動タスクで使用されているかチェック
            const { data: recurringTasks, error: checkError } = await supabase
                .from('recurring_tasks')
                .select('id')
                .eq('template_id', this.currentTemplate.id);

            if (checkError) throw checkError;

            // 月次自動タスクで使用されている場合は警告
            if (recurringTasks && recurringTasks.length > 0) {
                const message = `テンプレート「${this.currentTemplate.template_name}」は${recurringTasks.length}件の月次自動タスクで使用されています。\n\n削除すると関連する月次自動タスクも削除されます。\n続行しますか？`;
                if (!confirm(message)) {
                    return;
                }

                // 関連する月次自動タスクを先に削除
                const { error: deleteRecurringError } = await supabase
                    .from('recurring_tasks')
                    .delete()
                    .eq('template_id', this.currentTemplate.id);

                if (deleteRecurringError) throw deleteRecurringError;
            } else {
                // 通常の削除確認
                const confirmMessage = `テンプレート「${this.currentTemplate.template_name}」を削除しますか？\nこの操作は取り消せません。`;
                if (!confirm(confirmMessage)) {
                    return;
                }
            }

            // テンプレートを削除
            const { error } = await supabase
                .from('task_templates')
                .delete()
                .eq('id', this.currentTemplate.id);

            if (error) throw error;

            showToast('テンプレートを削除しました', 'success');
            await this.loadTemplates(); // テンプレート再読み込み
            this.closeTemplateEditModal();

            // テンプレートモーダルが開いている場合は更新
            const templateModal = document.getElementById('template-modal');
            if (templateModal && templateModal.style.display !== 'none') {
                this.renderTemplatesByTypeV2();
            }

        } catch (error) {
            console.error('❌ テンプレート削除エラー:', error);
            showToast('テンプレートの削除に失敗しました', 'error');
        }
    }

    // お気に入り状態の切り替え
    async toggleTemplateFavorite(template) {
        if (!template?.id) {
            console.warn('⚠️ 無効なテンプレートです');
            return;
        }

        const newFavoriteState = !template.is_favorite;
        console.log(`⭐ テンプレート「${template.template_name}」のお気に入り状態を変更: ${newFavoriteState}`);

        try {
            // データベースを更新
            const { error } = await supabase
                .from('task_templates')
                .update({ is_favorite: newFavoriteState })
                .eq('id', template.id);

            if (error) throw error;

            // ローカルデータを更新
            template.is_favorite = newFavoriteState;

            // UIを更新（該当するお気に入りボタンを探して更新）
            const favoriteBtn = document.querySelector(`button.favorite-btn[data-template-id="${template.id}"]`);
            if (favoriteBtn) {
                favoriteBtn.className = `favorite-btn ${newFavoriteState ? 'active' : ''}`;
                favoriteBtn.title = newFavoriteState ? 'お気に入りを解除' : 'お気に入りに追加';
            }

            // テンプレートアイテム全体のお気に入りクラスを更新
            const templateElement = favoriteBtn?.closest('.template-item');
            if (templateElement) {
                if (newFavoriteState) {
                    templateElement.classList.add('favorite');
                } else {
                    templateElement.classList.remove('favorite');
                }
            }

            // テンプレートリストを再ソートして表示
            this.renderTemplatesByTypeV2();

            // 成功メッセージ
            const message = newFavoriteState ?
                `📌 「${template.template_name}」をお気に入りに追加しました` :
                `📌 「${template.template_name}」をお気に入りから削除しました`;
            showToast(message, 'success');

        } catch (error) {
            console.error('❌ お気に入り状態の更新エラー:', error);
            showToast('お気に入り状態の更新に失敗しました', 'error');
        }
    }

    // ドラッグ&ドロップソート機能の初期化
    initializeSortable(container, type) {
        if (!window.Sortable) {
            console.warn('⚠️ SortableJSライブラリが利用できません');
            return;
        }

        // 既存のソート機能をクリア
        if (container.sortableInstance) {
            container.sortableInstance.destroy();
        }

        // 新しいソート機能を初期化
        container.sortableInstance = Sortable.create(container, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: (evt) => {
                this.handleTemplateSort(evt, type);
            }
        });

        console.log(`🔄 ${type}テンプレートのドラッグ&ドロップ機能を初期化しました`);
    }

    // テンプレートの並び替え処理
    async handleTemplateSort(evt, type) {
        const templateId = evt.item.dataset.templateId;
        const newIndex = evt.newIndex;
        const oldIndex = evt.oldIndex;

        if (newIndex === oldIndex) {
            console.log('📍 位置変更なし');
            return;
        }

        console.log(`🔄 ${type}テンプレート並び替え: ID=${templateId}, ${oldIndex} → ${newIndex}`);

        // 月次自動タスクの場合は専用処理
        if (type === 'recurring') {
            return await this.handleRecurringTaskSort(evt, newIndex, oldIndex);
        }

        try {
            // 該当タイプのテンプレートを取得
            const templatesOfType = this.templates.filter(template => {
                if (type === 'personal') {
                    return !template.is_global && (template.staff_id === this.currentUser?.id || !template.staff_id);
                } else {
                    return template.is_global;
                }
            });

            // display_orderを再計算
            const reorderedTemplates = [];
            templatesOfType.forEach((template, index) => {
                const newOrder = (index + 1) * 10; // 10, 20, 30, ...
                reorderedTemplates.push({
                    id: template.id,
                    display_order: newOrder
                });
            });

            // 移動したテンプレートのdisplay_orderを調整
            const movedTemplate = reorderedTemplates.find(t => t.id == templateId);
            if (movedTemplate) {
                movedTemplate.display_order = (newIndex + 1) * 10;
            }

            // データベースを一括更新
            const updates = reorderedTemplates.map(template => ({
                id: template.id,
                display_order: template.display_order
            }));

            await this.updateTemplateDisplayOrders(updates);

            // ローカルデータを更新
            this.templates.forEach(template => {
                const update = updates.find(u => u.id === template.id);
                if (update) {
                    template.display_order = update.display_order;
                }
            });

            console.log('✅ テンプレートの並び替えが完了しました');
            showToast('並び順を更新しました', 'success');

        } catch (error) {
            console.error('❌ 並び替え処理エラー:', error);
            showToast('並び替えの保存に失敗しました', 'error');

            // エラー時はリストを再描画してUIを元に戻す
            this.renderTemplatesByTypeV2();
        }
    }

    // テンプレートのdisplay_order一括更新
    async updateTemplateDisplayOrders(updates) {
        const promises = updates.map(update =>
            supabase
                .from('task_templates')
                .update({ display_order: update.display_order })
                .eq('id', update.id)
        );

        const results = await Promise.all(promises);

        // エラーチェック
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
            throw new Error(`並び替えの更新中にエラーが発生しました: ${errors.length}件`);
        }

        return results;
    }

    // タブナビゲーションの有効/無効切り替え
    disableTabNavigation(disable) {
        const tabNavigation = document.querySelector('.tab-navigation');
        if (!tabNavigation) {
            console.warn('⚠️ タブナビゲーション要素が見つかりません');
            return;
        }

        if (disable) {
            // タブナビゲーションを無効化
            tabNavigation.style.pointerEvents = 'none';
            tabNavigation.style.opacity = '0.3';
            tabNavigation.style.filter = 'blur(2px)';
            tabNavigation.setAttribute('data-disabled', 'true');
            console.log('🚫 タブナビゲーションを無効化しました');
        } else {
            // タブナビゲーションを再有効化
            tabNavigation.style.pointerEvents = '';
            tabNavigation.style.opacity = '';
            tabNavigation.style.filter = '';
            tabNavigation.removeAttribute('data-disabled');
            console.log('✅ タブナビゲーションを再有効化しました');
        }
    }

    // ========================================
    // 休日管理機能
    // ========================================

    // 休日管理モーダルを開く
    openHolidayModal() {
        const modal = document.getElementById('holiday-modal');
        if (modal) {
            modal.style.display = 'block';
            this.switchHolidayTab('company'); // デフォルトは会社休日タブ
            this.populateStaffDropdown(); // スタッフドロップダウンを設定
            this.loadHolidayLists();
        }
    }

    // スタッフドロップダウンを設定
    populateStaffDropdown() {
        const staffSelect = document.getElementById('staff-vacation-staff');
        if (!staffSelect) return;

        // 既存のオプションをクリア（最初のプレースホルダーは残す）
        while (staffSelect.options.length > 1) {
            staffSelect.remove(1);
        }

        // スタッフを追加
        this.staffs.forEach(staff => {
            const option = document.createElement('option');
            option.value = staff.id;
            option.textContent = staff.name;
            staffSelect.appendChild(option);
        });
    }

    // 休日管理モーダルを閉じる
    closeHolidayModal() {
        const modal = document.getElementById('holiday-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // タブ切り替え
    switchHolidayTab(tab) {
        const companyTab = document.getElementById('holiday-tab-company');
        const csvTab = document.getElementById('holiday-tab-csv');
        const companyPanel = document.getElementById('holiday-panel-company');
        const csvPanel = document.getElementById('holiday-panel-csv');

        if (tab === 'company') {
            // 会社休日タブをアクティブに
            companyTab.style.borderBottom = '3px solid #007bff';
            companyTab.style.color = '#007bff';
            csvTab.style.borderBottom = 'none';
            csvTab.style.color = '#6c757d';
            companyPanel.style.display = 'block';
            csvPanel.style.display = 'none';
        } else if (tab === 'csv') {
            // CSV入出力タブをアクティブに
            companyTab.style.borderBottom = 'none';
            companyTab.style.color = '#6c757d';
            csvTab.style.borderBottom = '3px solid #007bff';
            csvTab.style.color = '#007bff';
            companyPanel.style.display = 'none';
            csvPanel.style.display = 'block';
        }
    }

    // 休日リストを読み込む
    async loadHolidayLists() {
        await this.loadCompanyHolidays();
        await this.loadStaffVacations();
    }

    // 会社休日リストを読み込む
    async loadCompanyHolidays() {
        try {
            const { data: holidays, error } = await supabase
                .from('holidays')
                .select('*')
                .in('type', ['company', 'custom'])
                .order('date', { ascending: true });

            if (error) throw error;

            const listContainer = document.getElementById('company-holidays-list');
            if (!listContainer) return;

            if (!holidays || holidays.length === 0) {
                listContainer.innerHTML = '<p style="color: #999;">登録されている休日はありません</p>';
                return;
            }

            listContainer.innerHTML = holidays.map(h => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                    <div>
                        <strong>${h.date}</strong> - ${h.name}
                        <span style="color: #999; font-size: 12px;">(${h.type === 'company' ? '会社休日' : 'カスタム休日'})</span>
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="taskManager.deleteCompanyHoliday(${h.id})">削除</button>
                </div>
            `).join('');

        } catch (error) {
            console.error('会社休日の読み込みエラー:', error);
            window.showToast('会社休日の読み込みに失敗しました', 'error');
        }
    }

    // 個人休暇リストを読み込む
    async loadStaffVacations() {
        try {
            const { data: vacations, error } = await supabase
                .from('staff_vacations')
                .select('*, staffs(name)')
                .order('start_date', { ascending: false });

            if (error) throw error;

            const listContainer = document.getElementById('staff-vacations-list');
            if (!listContainer) return;

            if (!vacations || vacations.length === 0) {
                listContainer.innerHTML = '<p style="color: #999;">登録されている休暇はありません</p>';
                return;
            }

            listContainer.innerHTML = vacations.map(v => {
                const vacationType = v.vacation_type === 'paid' ? '有給' :
                                   v.vacation_type === 'sick' ? '病欠' : '私用';
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                        <div>
                            <strong>${v.staffs?.name || '不明'}</strong> -
                            ${v.start_date} 〜 ${v.end_date}
                            <span style="color: #999; font-size: 12px;">(${vacationType})</span>
                            ${v.notes ? `<br><span style="font-size: 12px; color: #666;">${v.notes}</span>` : ''}
                        </div>
                        <button class="btn btn-sm btn-danger" onclick="taskManager.deleteStaffVacation(${v.id})">削除</button>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('個人休暇の読み込みエラー:', error);
            window.showToast('個人休暇の読み込みに失敗しました', 'error');
        }
    }

    // 会社休日を追加
    async addCompanyHoliday() {
        const dateInput = document.getElementById('company-holiday-date');
        const nameInput = document.getElementById('company-holiday-name');

        console.log('🔍 addCompanyHoliday called');
        console.log('dateInput:', dateInput);
        console.log('nameInput:', nameInput);

        if (!dateInput || !nameInput) {
            console.error('❌ 入力要素が見つかりません');
            return;
        }

        const date = dateInput.value;
        const name = nameInput.value.trim() || '休業日';

        console.log('📅 入力データ:', { date, name });

        if (!date) {
            window.showToast('日付を入力してください', 'warning');
            return;
        }

        try {
            const year = new Date(date).getFullYear();

            console.log('💾 データベースに挿入中:', { year, date, name, type: 'company' });

            const { data, error } = await supabase
                .from('holidays')
                .insert({
                    year: year,
                    date: date,
                    name: name,
                    type: 'company',
                    is_working_day: false
                })
                .select();

            if (error) {
                console.error('❌ Supabaseエラー:', error);
                throw error;
            }

            console.log('✅ 挿入成功:', data);

            window.showToast('会社休日を追加しました', 'success');
            dateInput.value = '';
            nameInput.value = '';

            // リストを再読み込み
            await this.loadCompanyHolidays();

            // BusinessDayCalculatorの休日データも更新
            await this.businessDayCalc.loadHolidays();

            // ガントチャートを更新（表示中の場合）
            if (this.currentDisplay === 'gantt') {
                console.log('📊 ガントチャートを更新中...');
                this.updateDisplay();
            }

        } catch (error) {
            console.error('会社休日の追加エラー:', error);
            window.showToast('会社休日の追加に失敗しました: ' + error.message, 'error');
        }
    }

    // 会社休日を削除
    async deleteCompanyHoliday(holidayId) {
        if (!confirm('この休日を削除しますか？')) return;

        try {
            const { error } = await supabase
                .from('holidays')
                .delete()
                .eq('id', holidayId);

            if (error) throw error;

            window.showToast('会社休日を削除しました', 'success');

            // リストを再読み込み
            await this.loadCompanyHolidays();

            // BusinessDayCalculatorの休日データも更新
            await this.businessDayCalc.loadHolidays();

            // ガントチャートを更新（表示中の場合）
            if (this.currentDisplay === 'gantt') {
                this.updateDisplay();
            }

        } catch (error) {
            console.error('会社休日の削除エラー:', error);
            window.showToast('会社休日の削除に失敗しました', 'error');
        }
    }

    // 個人休暇を追加
    async addStaffVacation() {
        const staffSelect = document.getElementById('staff-vacation-staff');
        const startInput = document.getElementById('staff-vacation-start');
        const endInput = document.getElementById('staff-vacation-end');
        const typeSelect = document.getElementById('staff-vacation-type');
        const notesInput = document.getElementById('staff-vacation-notes');

        if (!staffSelect || !startInput || !endInput || !typeSelect) return;

        const staffId = staffSelect.value;
        const startDate = startInput.value;
        const endDate = endInput.value;
        const vacationType = typeSelect.value;
        const notes = notesInput?.value.trim() || '';

        if (!staffId) {
            window.showToast('スタッフを選択してください', 'warning');
            return;
        }

        if (!startDate || !endDate) {
            window.showToast('開始日と終了日を入力してください', 'warning');
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            window.showToast('終了日は開始日以降を指定してください', 'warning');
            return;
        }

        try {
            const { error } = await supabase
                .from('staff_vacations')
                .insert({
                    staff_id: parseInt(staffId),
                    start_date: startDate,
                    end_date: endDate,
                    vacation_type: vacationType,
                    notes: notes || null
                });

            if (error) throw error;

            window.showToast('個人休暇を追加しました', 'success');

            // フォームをリセット
            staffSelect.value = '';
            startInput.value = '';
            endInput.value = '';
            typeSelect.value = 'personal';
            if (notesInput) notesInput.value = '';

            // リストを再読み込み
            await this.loadStaffVacations();

            // BusinessDayCalculatorの休暇データも更新
            await this.businessDayCalc.loadHolidays();

            // ガントチャートを更新（表示中の場合）
            if (this.currentDisplay === 'gantt') {
                this.updateDisplay();
            }

        } catch (error) {
            console.error('個人休暇の追加エラー:', error);
            window.showToast('個人休暇の追加に失敗しました', 'error');
        }
    }

    // 個人休暇を削除
    async deleteStaffVacation(vacationId) {
        if (!confirm('この休暇を削除しますか？')) return;

        try {
            const { error } = await supabase
                .from('staff_vacations')
                .delete()
                .eq('id', vacationId);

            if (error) throw error;

            window.showToast('個人休暇を削除しました', 'success');

            // リストを再読み込み
            await this.loadStaffVacations();

            // BusinessDayCalculatorの休暇データも更新
            await this.businessDayCalc.loadHolidays();

            // ガントチャートを更新（表示中の場合）
            if (this.currentDisplay === 'gantt') {
                this.updateDisplay();
            }

        } catch (error) {
            console.error('個人休暇の削除エラー:', error);
            window.showToast('個人休暇の削除に失敗しました', 'error');
        }
    }

    // ========================================
    // 個人休暇トグル機能
    // ========================================

    async togglePersonalVacation(event) {
        console.log('🔍 togglePersonalVacation called');

        const dateElement = event.currentTarget;
        const date = dateElement.dataset.date;
        const isHoliday = dateElement.dataset.isHoliday === 'true';

        console.log('📅 Date:', date);
        console.log('🗓️ Is holiday:', isHoliday);
        console.log('👤 Current assignee:', this.currentAssigneeFilter);

        // 土日・祝日チェック
        if (isHoliday) {
            console.log('⚠️ 土日または祝日のためクリック不可');
            return;
        }

        // 担当者選択チェック
        if (!this.currentAssigneeFilter) {
            console.log('⚠️ 担当者未選択');
            window.showToast('担当者を選択してください', 'info');
            return;
        }

        const staffId = this.currentAssigneeFilter;
        console.log('💾 休暇トグル処理開始... staffId:', staffId);

        try {
            // 既存の休暇をチェック
            const { data: existingVacations, error: fetchError } = await supabase
                .from('staff_vacations')
                .select('id')
                .eq('staff_id', staffId)
                .lte('start_date', date)
                .gte('end_date', date);

            if (fetchError) throw fetchError;

            if (existingVacations && existingVacations.length > 0) {
                // 休暇を削除（出勤に戻す）
                const { error: deleteError } = await supabase
                    .from('staff_vacations')
                    .delete()
                    .eq('id', existingVacations[0].id);

                if (deleteError) throw deleteError;

                window.showToast('休暇を解除しました', 'success');
            } else {
                // 休暇を追加
                const { error: insertError } = await supabase
                    .from('staff_vacations')
                    .insert({
                        staff_id: staffId,
                        start_date: date,
                        end_date: date,
                        vacation_type: 'personal',
                        notes: null
                    });

                if (insertError) throw insertError;

                window.showToast('休暇を設定しました', 'success');
            }

            // BusinessDayCalculatorの休暇データを更新
            await this.businessDayCalc.loadStaffVacations(staffId);

            // ガントチャートを更新
            this.updateDisplay();

        } catch (error) {
            console.error('休暇トグルエラー:', error);
            window.showToast('休暇の設定に失敗しました', 'error');
        }
    }

    // ========================================
    // カード ドラッグ&ドロップ機能（ステータス変更）
    // ========================================

    handleCardDragStart(event) {
        const taskId = event.target.dataset.taskId;
        const currentStatus = event.target.dataset.taskStatus;

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('taskId', taskId);
        event.dataTransfer.setData('currentStatus', currentStatus);

        // ドラッグ中のスタイル
        event.target.style.opacity = '0.5';
        event.target.style.transform = 'scale(0.95)';
    }

    handleCardDragEnd(event) {
        // ドラッグ終了時にスタイルを戻す
        event.target.style.opacity = '1';
        event.target.style.transform = 'scale(1)';
    }

    handleSectionDragOver(event) {
        event.preventDefault();

        const section = event.currentTarget;
        const targetStatus = section.dataset.status;
        const taskId = parseInt(event.dataTransfer.getData('taskId'));
        const task = this.tasks.find(t => t.id === taskId);

        // 随時タスクを確認完了にドロップしようとしている場合
        if (task && task.is_anytime && targetStatus === '確認完了') {
            event.dataTransfer.dropEffect = 'none';

            // 禁止スタイル（赤色）
            section.style.boxShadow = '0 0 0 3px rgba(220, 53, 69, 0.7)';
            section.style.transform = 'scale(1.02)';
            section.style.background = '#ffe6e6';

            // 警告メッセージを表示（既存のメッセージがなければ追加）
            let warningMsg = section.querySelector('.drag-warning-message');
            if (!warningMsg) {
                warningMsg = document.createElement('div');
                warningMsg.className = 'drag-warning-message';
                warningMsg.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(220, 53, 69, 0.95); color: white; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; z-index: 1000; pointer-events: none; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                warningMsg.textContent = '❌ 随時タスクは「依頼中」に移動してください';
                section.style.position = 'relative';
                section.appendChild(warningMsg);
            }
        } else {
            event.dataTransfer.dropEffect = 'move';

            // 通常のハイライト（青色）
            section.style.boxShadow = '0 0 0 3px rgba(23, 162, 184, 0.5)';
            section.style.transform = 'scale(1.02)';
        }
    }

    handleSectionDragLeave(event) {
        // ハイライトを解除（子要素への移動を考慮）
        const section = event.currentTarget;
        if (!section.contains(event.relatedTarget)) {
            section.style.boxShadow = '';
            section.style.transform = 'scale(1)';
            section.style.background = '';

            // 警告メッセージを削除
            const warningMsg = section.querySelector('.drag-warning-message');
            if (warningMsg) {
                warningMsg.remove();
            }
        }
    }

    async handleSectionDrop(event) {
        event.preventDefault();

        // ハイライトを解除
        const section = event.currentTarget;
        section.style.boxShadow = '';
        section.style.transform = 'scale(1)';
        section.style.background = '';

        // 警告メッセージを削除
        const warningMsg = section.querySelector('.drag-warning-message');
        if (warningMsg) {
            warningMsg.remove();
        }

        const taskId = parseInt(event.dataTransfer.getData('taskId'));
        const currentStatus = event.dataTransfer.getData('currentStatus');
        const newStatus = section.dataset.status;

        if (!taskId || !newStatus) return;

        // 同じステータスへのドロップは無視
        if (currentStatus === newStatus) {
            window.showToast('既に同じステータスです', 'info');
            return;
        }

        // タスク情報を取得
        const task = this.tasks.find(t => t.id === taskId);

        console.log('📋 handleSectionDrop - taskId:', taskId, 'is_anytime:', task?.is_anytime, 'newStatus:', newStatus);

        // 随時タスクを確認完了にドロップした場合は禁止
        if (task && task.is_anytime && newStatus === '確認完了') {
            window.showToast('随時タスクは「依頼中」に移動してください', 'warning');
            return;
        }

        try {
            // updateTaskStatusを使用（work_date削除ロジックを含む）
            await this.updateTaskStatus(taskId, newStatus);

        } catch (error) {
            console.error('ステータス変更エラー:', error);
            window.showToast('ステータスの変更に失敗しました', 'error');
        }
    }

    // ========================================
    // ガントチャート ドラッグ&ドロップ機能
    // ========================================

    handleGanttDragStart(event) {
        const taskId = event.target.dataset.taskId;
        const assigneeId = event.target.dataset.taskAssignee;

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('taskId', taskId);
        event.dataTransfer.setData('assigneeId', assigneeId);

        // ドラッグ中のスタイル
        event.target.style.opacity = '0.5';
    }

    handleGanttDragEnd(event) {
        // ドラッグ終了時にスタイルを戻す
        event.target.style.opacity = '1';
    }

    handleGanttDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        // ドロップ可能なセルをハイライト
        event.target.style.background = 'rgba(23, 162, 184, 0.2)';
    }

    async handleGanttDrop(event) {
        event.preventDefault();

        // ハイライトを解除
        event.target.style.background = '';

        const taskId = parseInt(event.dataTransfer.getData('taskId'));
        const assigneeId = parseInt(event.dataTransfer.getData('assigneeId'));
        const newDate = event.target.dataset.date;

        if (!taskId || !newDate) return;

        // 営業日判定
        const date = new Date(newDate);
        const isAvailable = assigneeId
            ? this.businessDayCalc.isWorkingDay(date, assigneeId)
            : this.businessDayCalc.isBusinessDay(date);

        if (!isAvailable) {
            window.showToast('休日には配置できません', 'warning');
            return;
        }

        try {
            // タスクの開始日を更新
            const { error } = await supabase
                .from('tasks')
                .update({ work_date: newDate })
                .eq('id', taskId);

            if (error) throw error;

            window.showToast('タスクの日付を変更しました', 'success');

            // 表示を更新
            await this.loadTasks();
            this.updateDisplay();

        } catch (error) {
            console.error('タスク日付変更エラー:', error);
            window.showToast('日付の変更に失敗しました', 'error');
        }
    }

    // ========================================
    // CSV エクスポート・インポート機能
    // ========================================

    /**
     * 休日データをCSV形式でエクスポート
     */
    async exportHolidaysCSV() {
        try {
            // 全休日データを取得（IDを含む）
            const { data: holidays, error } = await supabase
                .from('holidays')
                .select('id, date, name, type')
                .order('date', { ascending: true });

            if (error) throw error;

            if (!holidays || holidays.length === 0) {
                window.showToast('エクスポートする休日データがありません', 'info');
                return;
            }

            // CSV形式に変換（ID列を追加）
            let csvContent = 'id,日付,名称,種類\n';
            holidays.forEach(h => {
                const id = h.id;
                const date = h.date;
                const name = h.name || '';
                const type = h.type || 'custom';
                csvContent += `${id},${date},${name},${type}\n`;
            });

            // BOM付きUTF-8でダウンロード（Excel対応）
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `holidays_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            window.showToast(`${holidays.length}件の休日データをエクスポートしました`, 'success');

        } catch (error) {
            console.error('CSVエクスポートエラー:', error);
            window.showToast('CSVエクスポートに失敗しました', 'error');
        }
    }

    /**
     * CSVファイルから休日データをインポート
     */
    async importHolidaysCSV() {
        const fileInput = document.getElementById('import-holidays-csv-file');
        const file = fileInput.files[0];

        if (!file) {
            window.showToast('CSVファイルを選択してください', 'info');
            return;
        }

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            // ヘッダー行をチェック
            const header = lines[0];
            const hasIdColumn = header.toLowerCase().includes('id');

            // ヘッダー行をスキップ
            const dataLines = lines.slice(1);

            if (dataLines.length === 0) {
                window.showToast('インポートするデータがありません', 'info');
                return;
            }

            const holidaysToUpsert = [];
            const csvIds = new Set(); // CSVに含まれるID
            let lineNumber = 2; // ヘッダー行の次から

            for (const line of dataLines) {
                const parts = line.split(',').map(p => p.trim());

                // ID列の有無で処理を分岐
                let id, date, name, type;

                if (hasIdColumn) {
                    // ID列がある場合: id,日付,名称,種類
                    if (parts.length < 4) {
                        console.warn(`行${lineNumber}: 形式が不正です（スキップ）: ${line}`);
                        lineNumber++;
                        continue;
                    }
                    [id, date, name, type] = parts;
                    id = id ? parseInt(id) : null;
                    if (id) csvIds.add(id); // CSVに含まれるIDを記録
                } else {
                    // ID列がない場合（旧形式）: 日付,名称,種類
                    if (parts.length < 3) {
                        console.warn(`行${lineNumber}: 形式が不正です（スキップ）: ${line}`);
                        lineNumber++;
                        continue;
                    }
                    [date, name, type] = parts;
                    id = null;
                }

                // 日付形式を正規化（Excel対応: 2025/10/13 -> 2025-10-13）
                if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(date)) {
                    const dateParts = date.split('/');
                    const year = dateParts[0];
                    const month = dateParts[1].padStart(2, '0');
                    const day = dateParts[2].padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                }

                // 日付バリデーション
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    console.warn(`行${lineNumber}: 日付形式が不正です（スキップ）: ${date}`);
                    lineNumber++;
                    continue;
                }

                // 種類バリデーション
                if (!['national', 'company', 'custom'].includes(type)) {
                    console.warn(`行${lineNumber}: 種類が不正です（スキップ）: ${type}`);
                    lineNumber++;
                    continue;
                }

                const holiday = {
                    date,
                    name: name || '休日',
                    type,
                    year: new Date(date).getFullYear(),
                    is_working_day: false
                };

                // IDがある場合は含める
                if (id) {
                    holiday.id = id;
                }

                holidaysToUpsert.push(holiday);
                lineNumber++;
            }

            if (holidaysToUpsert.length === 0) {
                window.showToast('有効なデータがありませんでした', 'error');
                return;
            }

            // 既存の全休日データを取得
            const { data: existingHolidays, error: fetchError } = await supabase
                .from('holidays')
                .select('id');

            if (fetchError) throw fetchError;

            const existingIds = new Set(existingHolidays.map(h => h.id));

            // 削除対象のIDを特定（既存にあるが、CSVにないID）
            const idsToDelete = [...existingIds].filter(id => !csvIds.has(id));

            // トランザクション的に処理
            // 1. データをupsert（IDベース）
            const { error: upsertError } = await supabase
                .from('holidays')
                .upsert(holidaysToUpsert, {
                    onConflict: 'id',
                    ignoreDuplicates: false
                });

            if (upsertError) throw upsertError;

            // 2. CSVに含まれていないIDを削除
            let deletedCount = 0;
            if (hasIdColumn && idsToDelete.length > 0) {
                const { error: deleteError } = await supabase
                    .from('holidays')
                    .delete()
                    .in('id', idsToDelete);

                if (deleteError) throw deleteError;
                deletedCount = idsToDelete.length;
            }

            const message = deletedCount > 0
                ? `${holidaysToUpsert.length}件を登録、${deletedCount}件を削除しました`
                : `${holidaysToUpsert.length}件の休日データをインポートしました`;

            window.showToast(message, 'success');

            // インポート結果を表示
            const resultDiv = document.getElementById('csv-import-result');
            const resultText = document.getElementById('csv-import-result-text');
            if (resultDiv && resultText) {
                resultText.textContent = `${holidays.length}件の休日データを登録しました。`;
                resultDiv.style.display = 'block';

                // 3秒後に非表示
                setTimeout(() => {
                    resultDiv.style.display = 'none';
                }, 3000);
            }

            // 休日データを再読み込み
            await this.businessDayCalc.loadHolidays();
            await this.loadCompanyHolidays();

            // ガントチャートを更新
            if (this.currentDisplay === 'gantt') {
                this.updateDisplay();
            }

            // ファイル選択をリセット
            fileInput.value = '';

        } catch (error) {
            console.error('CSVインポートエラー:', error);
            window.showToast('CSVインポートに失敗しました', 'error');
        }
    }

}

// グローバルインスタンス（タスク管理ページでのみ初期化）
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素が存在する場合のみTaskManagementを初期化
    const taskManagementElements = [
        'task-display-area',
        'assignee-sidebar',
        'tasks-table'
    ];

    const isTaskManagementPage = taskManagementElements.some(id => document.getElementById(id) !== null);

    if (isTaskManagementPage) {
        window.taskManager = new TaskManagement();
        console.log('TaskManagement initialized for task-management page');
    } else {
        console.log('TaskManagement initialization skipped - not on task-management page');
    }

    // 設定画面リンクのイベントリスナー（全ページ共通）
    const settingsLink = document.querySelector('.nav-tab.settings');
    if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            // supabase-client.jsのSupabaseAPIを使用
            if (window.SupabaseAPI && window.SupabaseAPI.redirectToSettings) {
                window.SupabaseAPI.redirectToSettings();
            } else {
                // フォールバック：直接import
                import('../../supabase-client.js').then(module => {
                    module.SupabaseAPI.redirectToSettings();
                });
            }
        });
    }
});