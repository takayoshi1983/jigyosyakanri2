// タスク管理システム - メイン機能
import { supabase } from '../../supabase-client.js';
import { formatDate, normalizeText } from '../../utils.js';
import '../../toast.js'; // showToastはwindow.showToastとしてグローバルに利用可能

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
        this.showCompleted = true; // 確認完了タスク表示
        this.showHidden = false; // 非表示タスク表示

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
            <div style="font-weight: 600; color: #495057cc;">${this.currentUser.name || 'ユーザー名なし'}</div>
            <div style="font-size: 15px; color: #6c757d;">${this.currentUser.email || 'メールなし'}</div>
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

            // 現在のユーザー情報取得
            const { data: staffData } = await supabase
                .from('staffs')
                .select('*')
                .eq('email', user.email)
                .single();

            this.currentUser = staffData;
            console.log('Current user:', this.currentUser);

            // ユーザー情報表示
            this.displayCurrentUserInfo();

            // 基本データ読み込み
            await this.loadMasterData();
            await this.loadTemplates();
            await this.loadRecurringTasks();
            await this.loadTasks();

            // UI初期化
            this.initializeUI();
            this.setupEventListeners();

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
                    template:task_templates(id, template_name, task_name, description, staff_id),
                    client:clients(id, name),
                    assignee:staffs(id, name)
                `)
                .eq('is_active', true)
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

            // 担当者サイドバーの初期化（フィルター状態復元含む）
            this.initializeAssigneeSidebar();

            this.updateDisplay();
            this.updateSummary();

        } catch (error) {
            console.error('Tasks loading error:', error);
            showToast('タスクの読み込みに失敗しました', 'error');
        }
    }

    initializeUI() {
        // 保存されたフィルター状態を復元
        this.updateFilterUI();

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

        // モーダル外クリックで閉じる
        document.getElementById('task-modal').addEventListener('click', (e) => {
            if (e.target.id === 'task-modal') {
                this.closeTaskModal();
            }
        });

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
        this.updateDisplay(); // タスク表示を更新
        this.saveFilterState(); // 状態を保存
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

        // タスク数カウント更新
        document.getElementById('total-task-count').textContent = `${filteredTasks.length}件`;

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
                const clientName = task.client_id === 0 ? 'その他業務' : (task.clients?.name || '');

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
                    aVal = a.client_id === 0 ? 'その他業務' : (a.clients?.name || '');
                    bVal = b.client_id === 0 ? 'その他業務' : (b.clients?.name || '');
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
        // 関係者のみ通常の定期チェック（60秒間隔）
        if (this.isRelevantUser()) {
            this.startAutoRefresh(60000); // 60秒間隔
        }
    }

    startAutoRefresh(intervalMs = 60000) {
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
        const requesterName = task.requester?.name || '不明';
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
        const dueDateText = this.formatDueDateWithWarning(task.due_date);
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

        // 事業者名（クリック可能）
        const clientName = task.client_id === 0 ? 'その他業務' :
            task.clients?.name ?
            `<a href="../../details.html?id=${task.client_id}" title="${task.clients.name}" onclick="event.stopPropagation()" style="color: #007bff; text-decoration: none;">${truncate(task.clients.name, 10)}</a>` : '-';

        tr.innerHTML = `
            <td style="text-align: center; padding: 4px 6px;" title="${this.getPriorityText(task.priority)}">${priorityStars}</td>
            <td style="padding: 4px 6px;" title="${task.client_id === 0 ? 'その他業務' : (task.clients?.name || '')}">${clientName}</td>
            <td style="padding: 4px 6px;" title="${task.task_name || ''}">${truncate(task.task_name, 15)}</td>
            <td style="padding: 4px 6px;" title="${task.description || ''}">${truncate(task.description, 12)}</td>
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

        // 行クリックでモーダル表示
        tr.addEventListener('click', (e) => {
            // ステータスバッジやリンククリック時は無視
            if (e.target.closest('.status-badge') || e.target.closest('a')) {
                return;
            }
            this.editTask(task.id);
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
        return `<span class="status-badge ${config.class}" style="cursor: pointer;"
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

        // 編集ボタンを最初に配置（常に左端）
        buttons.push(`<button class="btn btn-sm btn-edit" onclick="taskManager.editTask(${task.id})">編集</button>`);

        // ステータスに応じたボタン（委任者は全て操作可能）
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

        return `<div class="action-buttons">${buttons.join('')}</div>`;
    }

    formatMonthDay(dateString) {
        if (!dateString) return '-';

        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const day = date.getDate();

        return `${month}/${day}`;
    }

    formatDueDateWithWarning(dueDate) {
        if (!dueDate) return '-';

        const today = new Date();
        const due = new Date(dueDate);
        const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        const formattedDate = this.formatMonthDay(dueDate);

        if (diffDays < 0) {
            // 期限切れの場合：⚠️アイコン + 赤文字
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

        const dueDateText = this.formatDueDateWithWarning(task.due_date);
        const workDateText = task.work_date ? this.formatMonthDay(task.work_date) : '-';
        const dueDateClass = this.getDueDateClass(task.due_date);

        // 2行レイアウト用のデータ準備（マイタスクと同じ方式）
        const priorityStars = this.getPriorityDisplay(task.priority);
        const truncatedDescription = task.description ?
            (task.description.length > 12 ? task.description.substring(0, 12) + '…' : task.description) : '-';

        // 事業者リンク（省略なし、完了済みの場合は通常テキスト）
        const clientLink = task.client_id === 0 ?
            `<span style="color: ${isCompleted ? '#6c757d' : '#495057'}; font-size: 0.75rem;">その他業務</span>` :
            task.clients?.name ?
            (isCompleted ?
                `<span style="color: #6c757d; font-size: 0.75rem;">${task.clients.name}</span>` :
                `<a href="../../details.html?id=${task.client_id}" title="${task.clients.name}" onclick="event.stopPropagation()" style="color: #007bff; text-decoration: none; font-size: 0.75rem;">${task.clients.name}</a>`
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
            <div style="display: flex; flex-direction: column; gap: 3px; padding: 6px;">
                <!-- 上段：事業者名とタスク名を最大限活用 -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.75rem; flex: 0 0 auto; white-space: nowrap;" title="${task.client_id === 0 ? 'その他業務' : (task.clients?.name || '')}">${clientLink}</span>
                    <span style="font-size: 0.8rem; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${textColor};" title="${task.task_name || 'Untitled Task'}">${task.task_name || 'Untitled Task'}</span>
                    <span style="font-size: 0.7rem; flex: 0 0 auto; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60px;" title="${task.description || ''}">${truncatedDescription}</span>
                </div>
                <!-- 下段：重要度+詳細情報 -->
                <div style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: ${textColor};">
                    <span style="flex: 0 0 20px; color: ${textColor};" title="${this.getPriorityText(task.priority)}">${priorityStars}</span>
                    <span style="flex: 0 0 auto; text-align: center;">${urlIcon}</span>
                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${task.requester?.name || ''}">依頼：${requesterName}</span>
                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${task.assignee?.name || ''}">受任：${assigneeName}</span>
                    <span style="flex: 0 0 auto; color: ${linkColor}; white-space: nowrap;" title="${task.due_date || ''}">${dueDateDisplay}</span>
                    <span style="flex: 0 0 auto; white-space: nowrap;" title="${task.work_date || ''}">${workDateDisplay}</span>
                </div>
            </div>
        `;

        // クリックで詳細表示
        card.addEventListener('click', () => {
            this.editTask(task.id);
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
                    const newStatus = evt.to.parentElement.dataset.status;

                    // 元の位置と同じ場合は何もしない
                    if (evt.from === evt.to) {
                        return;
                    }

                    console.log(`Moving task ${taskId} to status: ${newStatus}`);

                    try {
                        // ステータス更新
                        await this.updateTaskStatus(taskId, newStatus);
                    } catch (error) {
                        console.error('Failed to update task status:', error);
                        // エラー時は元の位置に戻す
                        evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex]);
                        showToast('タスクの移動に失敗しました', 'error');
                    }
                },
                onMove: (evt) => {
                    // ドラッグ中の視覚的フィードバック
                    return true;
                }
            });
        });
    }

    updateCalendarView(tasks) {
        // カレンダー表示は今後実装
        const calendarContainer = document.getElementById('task-calendar');
        calendarContainer.innerHTML = `
            <p style="text-align: center; padding: 50px; color: #6c757d;">
                📅 カレンダー表示は今後実装予定です<br>
                <small>現在: ${tasks.length}件のタスクがあります</small>
            </p>
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

                // 検索可能プルダウンに値を設定
                if (this.searchableSelect) {
                    this.searchableSelect.setValue(task.client_id || '');
                } else {
                    document.getElementById('client-select').value = task.client_id || '';
                }

                document.getElementById('assignee-select').value = task.assignee_id || '';
                document.getElementById('priority-select').value = task.priority || '2';
                document.getElementById('due-date').value = task.due_date || '';
                document.getElementById('work-date').value = task.work_date || '';
                document.getElementById('estimated-hours').value = task.estimated_time_hours || '';
                document.getElementById('task-description').value = task.description || '';
                document.getElementById('reference-url').value = task.reference_url || '';

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
            }
            form.dataset.taskId = taskId;
        } else if (!templateMode) {
            title.textContent = template ? `テンプレートから作成: ${template.template_name}` : '新規タスク作成';
            form.dataset.taskId = '';
            this.setModalMode('edit'); // 新規作成は常に編集モード

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

                // URL自動リンク表示を更新
                if (this.linkedTextDisplay) {
                    this.linkedTextDisplay.updateDisplay();
                }
                if (this.referenceUrlDisplay) {
                    this.referenceUrlDisplay.updateDisplay();
                }
            }

            // デフォルト値設定
            if (this.currentUser) {
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
        }
    }

    closeTaskModal() {
        const modal = document.getElementById('task-modal');
        modal.style.display = 'none';
        this.setUserInteracting(false); // モーダル閉じる時は操作中フラグOFF
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

        const taskData = {
            task_name: document.getElementById('task-name').value.trim(),
            client_id: clientSelectValue !== '' ? parseInt(clientSelectValue) : null,
            assignee_id: parseInt(document.getElementById('assignee-select').value) || null,
            priority: parseInt(document.getElementById('priority-select').value) || 2,
            due_date: document.getElementById('due-date').value || null,
            work_date: document.getElementById('work-date').value || null,
            estimated_time_hours: parseFloat(document.getElementById('estimated-hours').value) || null,
            description: document.getElementById('task-description').value.trim() || null,
            reference_url: document.getElementById('reference-url').value.trim() || null
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

        // client_id が null または undefined の場合のみエラー（0は有効な値）
        if (taskData.client_id === null || taskData.client_id === undefined) {
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

        } catch (error) {
            console.error('Save task error:', error);
            showToast('保存に失敗しました', 'error');
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
    }

    async updateTaskStatus(taskId, newStatus) {
        try {
            const updateData = { status: newStatus };

            if (newStatus === '作業完了') {
                updateData.completed_at = new Date().toISOString();
            } else if (newStatus === '確認完了') {
                updateData.confirmed_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('tasks')
                .update(updateData)
                .eq('id', taskId);

            if (error) throw error;

            showToast(`タスクを「${newStatus}」に更新しました`, 'success');
            await this.loadTasks(); // データ再読み込み

        } catch (error) {
            console.error('Update status error:', error);
            showToast('ステータス更新に失敗しました', 'error');
        }
    }

    async cycleTaskStatus(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        // ステータスサイクル：依頼中 → 作業完了 → 確認完了 → 依頼中
        const statusCycle = {
            '依頼中': '作業完了',
            '作業完了': '確認完了',
            '確認完了': '依頼中'
        };

        const nextStatus = statusCycle[task.status] || '作業完了';
        await this.updateTaskStatus(taskId, nextStatus);
    }

    editTask(taskId) {
        this.openTaskModal(taskId, null, true); // 閲覧モードで開く
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

        // カウント更新
        document.getElementById('assigned-count').textContent = assignedTasks.length;
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

        // 完了済みタスクの場合はグレーアウト
        if (isCompleted) {
            item.classList.add('task-completed-gray');
        }

        const dueDateText = this.formatDueDateWithWarning(task.due_date);
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
        const clientLink = task.client_id === 0 ?
            `<span style="color: ${isCompleted ? '#6c757d' : '#495057'}; font-size: 0.75rem;">その他業務</span>` :
            task.clients?.name ?
            (isCompleted ?
                `<span style="color: #6c757d; font-size: 0.75rem;">${task.clients.name}</span>` :
                `<a href="../../details.html?id=${task.client_id}" title="${task.clients.name}" onclick="event.stopPropagation()" style="color: #007bff; text-decoration: none; font-size: 0.75rem;">${task.clients.name}</a>`
            ) : '-';

        // 参照URLアイコン（完了済みの場合はグレー）
        const urlIcon = task.reference_url ?
            (isCompleted ?
                `<span style="font-size: 0.8rem; color: #adb5bd;">🔗</span>` :
                `<a href="${task.reference_url}" target="_blank" title="${task.reference_url}" onclick="event.stopPropagation()" style="font-size: 0.8rem;">🔗</a>`
            ) : '-';

        // ステータス（完了済みの場合はクリック不可）
        const clickableStatus = isCompleted ?
            this.createStaticStatus(task) :
            this.createCompactClickableStatus(task);

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
            <div style="display: flex; position: relative;">
                <!-- 左側：メイン情報エリア -->
                <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; padding-right: 80px;">
                    <!-- 上段 -->
                    <div style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                        <span style="font-size: 0.75rem; flex: 0 0 auto; white-space: nowrap; min-width: 80px;" title="${task.client_id === 0 ? 'その他業務' : (task.clients?.name || '')}">${clientLink}</span>
                        <span style="font-size: 0.75rem; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${textColor};" title="${task.task_name || 'Untitled Task'}">${task.task_name || 'Untitled Task'}</span>
                        <span style="font-size: 0.7rem; flex: 0 0 90px; color: #6c757d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;" title="${task.description || ''}">${truncatedDescription}</span>
                    </div>
                    <!-- 下段 -->
                    <div style="display: flex; align-items: center; gap: 14px; font-size: 0.7rem; color: ${textColor}; white-space: nowrap;">
                        <span style="font-size: 0.7rem; flex: 0 0 30px; white-space: nowrap; color: ${textColor};" title="${this.getPriorityText(task.priority)}">${priorityStars}</span>
                        <span style="flex: 0 0 30px; text-align: center; white-space: nowrap;">${urlIcon}</span>
                        <span style="flex: 0 0 auto; white-space: nowrap; min-width: 80px; overflow: hidden; text-overflow: ellipsis;">${personDisplay}</span>
                        <span style="flex: 0 0 65px; color: ${linkColor}; white-space: nowrap;" title="${task.due_date || ''}">${dueDateDisplay}</span>
                        <span style="flex: 0 0 65px; white-space: nowrap;" title="${task.work_date || ''}">${workDateDisplay}</span>
                    </div>
                </div>

                <!-- 右側：ステータス（上下段をまたがって表示） -->
                <div style="position: absolute; right: -5%; top: 50%; transform: translateY(-50%); display: flex; align-items: center; height: 100%;">
                    ${clickableStatus}
                </div>
            </div>
        `;

        // 行クリックイベント（詳細表示・編集）
        item.addEventListener('click', (e) => {
            // リンクやステータスクリック時は無視
            if (e.target.closest('a') || e.target.closest('.my-task-status')) {
                return;
            }
            this.editTask(task.id);
        });

        return item;
    }

    createCompactClickableStatus(task) {
        const statusConfig = {
            '依頼中': { class: 'my-task-status-pending', text: '📝 依頼中', next: '作業完了' },
            '作業完了': { class: 'my-task-status-working', text: '✅ 確認待ち', next: '確認完了' },
            '確認完了': { class: 'my-task-status-completed', text: '☑️ 確認完了', next: '依頼中' }
        };

        const config = statusConfig[task.status] || statusConfig['依頼中'];
        return `<span class="my-task-status ${config.class}" style="cursor: pointer; padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500; min-width: 70px; text-align: center; border: 1px solid #d2b866;"
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
            // 確認待ち（作業完了）タスクの受託者への非表示処理
            if (task.status === '作業完了' && task.completed_at && task.assignee_id === this.currentUser.id) {
                const completedDate = new Date(task.completed_at);
                const jstCompletedDate = new Date(completedDate.getTime() + (jstOffset * 60 * 1000));
                const completedDay = new Date(jstCompletedDate.getFullYear(), jstCompletedDate.getMonth(), jstCompletedDate.getDate());
                const diffDays = Math.floor((today - completedDay) / (1000 * 60 * 60 * 24));

                // 受託者のみ：翌日以降は非表示（依頼者には表示される）
                if (diffDays >= 1) {
                    return false;
                }
            }

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
        const showCompletedCheckbox = document.getElementById('show-completed');
        const showHiddenCheckbox = document.getElementById('show-hidden');

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

        if (showCompletedCheckbox) {
            showCompletedCheckbox.addEventListener('change', (e) => {
                this.showCompleted = e.target.checked;
            });
        }

        if (showHiddenCheckbox) {
            showHiddenCheckbox.addEventListener('change', (e) => {
                this.showHidden = e.target.checked;
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

        // ステータスフィルター適用
        if (!this.showCompleted) {
            filtered = filtered.filter(task => task.status !== '確認完了');
        }

        if (!this.showHidden) {
            // 通常非表示のタスクを除外
            filtered = this.applyTimeBasedVisibility(filtered);
        }

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
                const clientName = task.client_id === 0 ? 'その他業務' : (task.clients?.name || '');

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
                    aVal = a.client_id === 0 ? 'その他業務' : (a.clients?.name || '');
                    bVal = b.client_id === 0 ? 'その他業務' : (b.clients?.name || '');
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

        // 表示更新
        document.getElementById('total-task-count').textContent = `${filtered.length}件`;

        if (this.currentDisplay === 'list') {
            this.updateListView(filtered);
        } else if (this.currentDisplay === 'card') {
            this.updateCardView(filtered);
        }
    }

    // 履歴設定をローカルストレージに保存
    saveHistorySettings() {
        const settings = {
            historyPeriod: this.historyPeriod,
            showCompleted: this.showCompleted,
            showHidden: this.showHidden
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
                this.showCompleted = settings.showCompleted !== undefined ? settings.showCompleted : true;
                this.showHidden = settings.showHidden !== undefined ? settings.showHidden : false;

                // UIを更新
                const historyPeriodSelect = document.getElementById('history-period-select');
                const showCompletedCheckbox = document.getElementById('show-completed');
                const showHiddenCheckbox = document.getElementById('show-hidden');

                if (historyPeriodSelect) historyPeriodSelect.value = this.historyPeriod;
                if (showCompletedCheckbox) showCompletedCheckbox.checked = this.showCompleted;
                if (showHiddenCheckbox) showHiddenCheckbox.checked = this.showHidden;
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

        // 現在のユーザーが作成した月次自動タスクのみ表示（担当者は別の人でも可）
        const recurringTasks = this.recurringTasks.filter(task =>
            task.template?.staff_id === this.currentUser?.id && task.is_active
        );

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
        element.dataset.templateId = recurringTask.template?.id; // ソート処理で使用
        element.dataset.templateType = 'recurring';

        // 月次自動タスクの情報を準備
        const templateName = recurringTask.template?.template_name || '未設定';
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
                this.openRecurringTaskEditModal(recurringTask);
                return;
            }

            // 削除ボタンクリック
            if (target.classList.contains('template-delete-btn')) {
                e.stopPropagation();
                this.deleteRecurringTask(recurringTask.id);
                return;
            }

            // その他のクリック（詳細表示）
            if (!target.closest('.template-actions')) {
                this.openRecurringTaskEditModal(recurringTask, 'view');
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

        modal.style.display = 'block';
        this.setUserInteracting(true);

        // タブナビゲーションを無効化
        this.disableTabNavigation(true);

        console.log('✅ 月次自動タスク編集モーダルが開かれました');
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

        // フォームデータを設定
        if (mode !== 'create' && recurringTask) {
            this.populateRecurringTaskForm(recurringTask);
        } else {
            // 新規作成時のデフォルト値設定
            this.setRecurringTaskDefaults();
        }
    }

    populateRecurringTaskForm(recurringTask) {
        // 期限日設定
        const dueDaySelect = document.getElementById('template-due-day');
        if (dueDaySelect && recurringTask.frequency_day) {
            dueDaySelect.value = recurringTask.frequency_day;
        }

        // 何日前に作成設定（今は仮で3日前をデフォルト）
        const createBeforeSelect = document.getElementById('template-create-days-before');
        if (createBeforeSelect) {
            createBeforeSelect.value = '3';
        }

        // 受託者
        const assigneeSelect = document.getElementById('template-default-assignee');
        if (assigneeSelect && recurringTask.assignee_id) {
            assigneeSelect.value = recurringTask.assignee_id;
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

            let templateId = null;

            // 1. テンプレートを作成または更新
            if (!this.currentRecurringTask) {
                // 新規作成の場合、先にテンプレートを作成
                const templateData = {
                    template_name: formData.template_name,
                    task_name: formData.template_name,
                    description: '月次自動タスク',
                    estimated_time_hours: formData.estimated_time_hours,
                    is_global: false,
                    staff_id: this.currentUser.id,
                    client_id: formData.client_id,
                    reference_url: formData.reference_url,
                    default_assignee_id: formData.default_assignee_id
                };

                const templateResult = await supabase
                    .from('task_templates')
                    .insert([templateData])
                    .select('id')
                    .single();

                if (templateResult.error) throw templateResult.error;
                templateId = templateResult.data.id;
                console.log('✅ Template created with ID:', templateId);
            } else {
                // 編集の場合は既存のtemplate_idを使用
                templateId = this.currentRecurringTask.template_id;
            }

            // 2. recurring_tasksを作成または更新
            const recurringData = {
                template_id: templateId,
                client_id: formData.client_id,
                assignee_id: formData.assignee_id,
                frequency_type: formData.frequency_type,
                frequency_day: formData.frequency_day,
                is_active: formData.is_active,
                next_run_date: formData.next_run_date
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

        // frequency_dayを計算（期限日から作成日数を引いた日）
        const frequencyDay = parseInt(dueDay) - parseInt(createDaysBefore);

        // 次回実行日を計算（来月の実行日）
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(Math.max(1, frequencyDay));

        const formData = {
            template_name: templateName, // テンプレート作成用
            client_id: clientId, // 事業者指定（nullの場合は全事業者対象）
            reference_url: referenceUrl, // 参照URL
            estimated_time_hours: estimatedTimeHours, // 想定時間
            default_assignee_id: parseInt(assigneeId), // 既定の受託者
            assignee_id: parseInt(assigneeId),
            frequency_type: 'monthly',
            frequency_day: Math.max(1, frequencyDay),
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

        // 現在のテンプレート情報を保存
        this.currentTemplate = template;
        this.currentTemplateType = type;

        // フォームをリセット
        const form = document.getElementById('template-edit-form');
        if (form) {
            form.reset();
        }

        // モードに応じてUI更新
        this.setTemplateEditModeV2(mode, template, type);

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
                `${template.template_name} - ${this.getTypeDisplayName(type)}`;
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
            // 現在のユーザーの月次自動タスクを取得（表示順で）
            const userRecurringTasks = this.recurringTasks.filter(task =>
                task.template?.staff_id === this.currentUser?.id && task.is_active
            );

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
            this.setTemplateEditModeV2('edit', this.currentTemplate, this.currentTemplateType);
        });

        this.setupSafeEventListener('template-use-btn', 'click', () => {
            this.useTemplateForTask(this.currentTemplate);
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
});