// タスク管理システム - メイン機能
import { supabase } from '../../supabase-client.js';
import { formatDate } from '../../utils.js';
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
        this.currentFilters = {
            view: 'all',
            status: '',
            assignee: '',
            client: '',
            search: ''
        };
        this.currentSort = { field: 'due_date', direction: 'asc' };
        this.currentDisplay = 'list';

        this.init();
    }

    async init() {
        try {
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

            // 基本データ読み込み
            await this.loadMasterData();
            await this.loadTemplates();
            await this.loadTasks();

            // UI初期化
            this.initializeUI();
            this.setupEventListeners();

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

    updateDropdowns() {
        // フィルター用ドロップダウン
        const assigneeFilter = document.getElementById('assignee-filter');
        const clientFilter = document.getElementById('client-filter');

        // モーダル用ドロップダウン（従来の受任者のみ）
        const assigneeSelect = document.getElementById('assignee-select');

        // フィルター - 受任者
        assigneeFilter.innerHTML = '<option value="">全て</option>';
        this.staffs.forEach(staff => {
            assigneeFilter.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
        });

        // フィルター - 事業者
        clientFilter.innerHTML = '<option value="">全て</option>';
        clientFilter.innerHTML += '<option value="0">その他業務</option>';
        this.clients.forEach(client => {
            clientFilter.innerHTML += `<option value="${client.id}">${client.name}</option>`;
        });

        // モーダル - 受任者（従来通り）
        assigneeSelect.innerHTML = '<option value="">選択してください</option>';
        this.staffs.forEach(staff => {
            assigneeSelect.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
        });

        // 検索可能プルダウンのオプションを更新（後で実行）
        if (this.searchableSelect) {
            this.searchableSelect.updateOptions();
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

            this.updateDisplay();
            this.updateSummary();

        } catch (error) {
            console.error('Tasks loading error:', error);
            showToast('タスクの読み込みに失敗しました', 'error');
        }
    }

    initializeUI() {
        // 表示切替ボタンの状態設定
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === this.currentFilters.view);
        });

        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.display === this.currentDisplay);
        });

        // 表示切替
        this.switchDisplay(this.currentDisplay);
    }

    setupEventListeners() {
        // 表示切替ボタン
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilters.view = e.target.dataset.view;
                this.updateDisplay();
            });
        });

        // 表示形式切替ボタン
        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.display-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentDisplay = e.target.dataset.display;
                this.switchDisplay(this.currentDisplay);
            });
        });

        // フィルター
        ['status-filter', 'assignee-filter', 'client-filter'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                const filterType = id.replace('-filter', '');
                this.currentFilters[filterType] = e.target.value;
                this.updateDisplay();
            });
        });

        // 検索
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.currentFilters.search = e.target.value;
            this.updateDisplay();
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
            this.openTemplateModal();
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
    }

    initializeLinkedTextDisplay() {
        const taskDescriptionTextarea = document.getElementById('task-description');
        if (taskDescriptionTextarea) {
            this.linkedTextDisplay = createLinkedTextDisplay(taskDescriptionTextarea);
        }
    }

    initializeSearchableSelect() {
        const searchInput = document.getElementById('client-search');
        const dropdown = document.getElementById('client-dropdown');
        const hiddenSelect = document.getElementById('client-select');
        const wrapper = searchInput.parentElement;

        let highlightedIndex = -1;
        let allOptions = [];

        // オプションデータを準備
        const updateOptions = () => {
            allOptions = [
                { value: '0', text: 'その他業務', searchText: 'その他業務' },
                ...this.clients.map(client => ({
                    value: client.id.toString(),
                    text: client.name,
                    searchText: client.name
                }))
            ];
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
            const filtered = allOptions.filter(option =>
                option.searchText.toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (filtered.length === 0) {
                dropdown.innerHTML = '<div class="searchable-select-no-results">該当する事業者が見つかりません</div>';
                return;
            }

            dropdown.innerHTML = filtered.map((option, index) => {
                const isSelected = hiddenSelect.value === option.value;
                return `<div class="searchable-select-item ${isSelected ? 'selected' : ''}" data-value="${option.value}" data-index="${index}">${option.text}</div>`;
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
                        selectItem(item.dataset.value, item.textContent);
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
                selectItem(item.dataset.value, item.textContent);
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

        // 初期化
        updateOptions();

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
                const option = allOptions.find(opt => opt.value === value.toString());
                if (option) {
                    selectItem(option.value, option.text);
                } else {
                    this.searchableSelect.clear();
                }
            }
        };
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
    }

    updateDisplay() {
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

        // 表示切替（全体 vs 自分）
        if (this.currentFilters.view === 'my') {
            filtered = filtered.filter(task =>
                task.assignee_id === this.currentUser.id ||
                task.requester_id === this.currentUser.id
            );
        }

        // ステータスフィルター
        if (this.currentFilters.status) {
            filtered = filtered.filter(task => task.status === this.currentFilters.status);
        }

        // 受任者フィルター
        if (this.currentFilters.assignee) {
            filtered = filtered.filter(task => task.assignee_id == this.currentFilters.assignee);
        }

        // 事業者フィルター
        if (this.currentFilters.client) {
            filtered = filtered.filter(task => task.client_id == this.currentFilters.client);
        }

        // 検索フィルター
        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(task => {
                const clientName = task.client_id === 0 ? 'その他業務' : (task.clients?.name || '');
                return task.task_name.toLowerCase().includes(search) ||
                       clientName.toLowerCase().includes(search) ||
                       (task.description || '').toLowerCase().includes(search);
            });
        }

        // ソート
        filtered.sort((a, b) => {
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
        });

        return filtered;
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
        const dueDateText = task.due_date ? this.formatMonthDay(task.due_date) : '-';
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
            '作業完了': { class: 'status-working', text: '⚙️ 作業完了', next: '確認完了' },
            '確認完了': { class: 'status-completed', text: '✅ 確認完了', next: '依頼中' }
        };

        const config = statusConfig[task.status] || statusConfig['依頼中'];
        return `<span class="status-badge ${config.class}" style="cursor: pointer;"
                      title="クリックで「${config.next}」に変更"
                      onclick="event.stopPropagation(); taskManager.cycleTaskStatus(${task.id})">${config.text}</span>`;
    }

    createStatusBadge(status) {
        const statusConfig = {
            '依頼中': { class: 'status-pending', text: '📝 依頼中' },
            '作業完了': { class: 'status-working', text: '⚙️ 作業完了' },
            '確認完了': { class: 'status-completed', text: '✅ 確認完了' }
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
                buttons.push(`<button class="btn btn-sm btn-complete" onclick="taskManager.updateTaskStatus(${task.id}, '作業完了')">作業完了</button>`);
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
            '作業完了': '⚙️ 作業完了',
            '確認完了': '✅ 確認完了'
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
            this.initializeSortable();
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

        const dueDateText = task.due_date ? this.formatMonthDay(task.due_date) : '-';
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

    initializeSortable() {
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
    }

    setModalMode(mode) {
        const form = document.getElementById('task-form');
        const inputs = form.querySelectorAll('input, select, textarea');
        const viewModeButtons = document.getElementById('view-mode-buttons');
        const editModeButtons = document.getElementById('edit-mode-buttons');

        if (mode === 'view') {
            // 閲覧モード
            inputs.forEach(input => {
                input.disabled = true;
                input.style.backgroundColor = '#f8f9fa';
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
    }

    closeTemplateModal() {
        const modal = document.getElementById('template-modal');
        modal.style.display = 'none';
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
        const taskData = {
            task_name: document.getElementById('task-name').value.trim(),
            client_id: parseInt(document.getElementById('client-select').value) || null,
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

        // 受任タスク（自分が実行する、確認完了以外）
        const assignedTasks = this.tasks.filter(task =>
            task.assignee_id === this.currentUser.id &&
            task.status !== '確認完了'
        );

        // 依頼タスク（自分が作成した、ただし自分自身のタスクは除く、確認完了以外）
        const requestedTasks = this.tasks.filter(task =>
            task.requester_id === this.currentUser.id &&
            task.assignee_id !== this.currentUser.id &&
            task.status !== '確認完了'
        );

        // 確認完了したタスク（自分が関わったもの）
        const completedTasks = this.tasks.filter(task =>
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
            container.innerHTML = '<div style="text-align: center; color: #6c757d; font-size: 0.8rem; padding: 15px;">該当するタスクはありません</div>';
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

        const dueDateText = task.due_date ? this.formatMonthDay(task.due_date) : '';
        const dueDateClass = this.getDueDateClass(task.due_date);

        const statusConfig = {
            '依頼中': { class: 'compact-status-pending', text: '依頼中' },
            '作業完了': { class: 'compact-status-working', text: '作業完了' },
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
                    <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                        <span style="font-size: 0.7rem; flex: 0 0 30px; white-space: nowrap; color: ${textColor};" title="${this.getPriorityText(task.priority)}">${priorityStars}</span>
                        <span style="font-size: 0.75rem; flex: 0 0 auto; white-space: nowrap; min-width: 80px;" title="${task.client_id === 0 ? 'その他業務' : (task.clients?.name || '')}">${clientLink}</span>
                        <span style="font-size: 0.75rem; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${textColor};" title="${task.task_name || 'Untitled Task'}">${task.task_name || 'Untitled Task'}</span>
                        <span style="font-size: 0.7rem; flex: 0 0 90px; color: #6c757d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;" title="${task.description || ''}">${truncatedDescription}</span>
                    </div>
                    <!-- 下段 -->
                    <div style="display: flex; align-items: center; gap: 14px; font-size: 0.7rem; color: ${textColor}; white-space: nowrap;">
                        <span style="flex: 0 0 30px; text-align: center; white-space: nowrap;">${urlIcon}</span>
                        <span style="flex: 0 0 auto; white-space: nowrap; min-width: 80px; overflow: hidden; text-overflow: ellipsis;">${personDisplay}</span>
                        <span style="flex: 0 0 65px; color: ${linkColor}; white-space: nowrap;" title="${task.due_date || ''}">${dueDateDisplay}</span>
                        <span style="flex: 0 0 65px; white-space: nowrap;" title="${task.work_date || ''}">${workDateDisplay}</span>
                    </div>
                </div>

                <!-- 右側：ステータス（上下段をまたがって表示） -->
                <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; height: 100%;">
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
            '作業完了': { class: 'my-task-status-working', text: '⚙️ 作業完了', next: '確認完了' },
            '確認完了': { class: 'my-task-status-completed', text: '✅ 確認完了', next: '依頼中' }
        };

        const config = statusConfig[task.status] || statusConfig['依頼中'];
        return `<span class="my-task-status ${config.class}" style="cursor: pointer; padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500; min-width: 70px; text-align: center; border: 1px solid #d2b866;"
                      title="クリックで「${config.next}」に変更"
                      onclick="event.stopPropagation(); taskManager.cycleTaskStatus(${task.id})">${config.text}</span>`;
    }

    createStaticStatus(task) {
        return `<span style="padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500; min-width: 70px; text-align: center; background: #e9ecef; color: #6c757d; border: 1px solid #ced4da;">✅ 確認完了</span>`;
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
}

// グローバルインスタンス
window.taskManager = new TaskManagement();