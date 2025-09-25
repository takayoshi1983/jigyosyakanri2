// タスク管理システム - メイン機能
import { supabase } from './supabase-client.js';
import { showToast, formatDate } from './utils.js';

class TaskManagement {
    constructor() {
        this.currentUser = null;
        this.clients = [];
        this.staffs = [];
        this.tasks = [];
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

    updateDropdowns() {
        // フィルター用ドロップダウン
        const assigneeFilter = document.getElementById('assignee-filter');
        const clientFilter = document.getElementById('client-filter');

        // モーダル用ドロップダウン
        const clientSelect = document.getElementById('client-select');
        const assigneeSelect = document.getElementById('assignee-select');

        // フィルター - 担当者
        assigneeFilter.innerHTML = '<option value="">全て</option>';
        this.staffs.forEach(staff => {
            assigneeFilter.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
        });

        // フィルター - 事業者
        clientFilter.innerHTML = '<option value="">全て</option>';
        this.clients.forEach(client => {
            clientFilter.innerHTML += `<option value="${client.id}">${client.name}</option>`;
        });

        // モーダル - 事業者
        clientSelect.innerHTML = '<option value="">選択してください</option>';
        this.clients.forEach(client => {
            clientSelect.innerHTML += `<option value="${client.id}">${client.name}</option>`;
        });

        // モーダル - 担当者
        assigneeSelect.innerHTML = '<option value="">選択してください</option>';
        this.staffs.forEach(staff => {
            assigneeSelect.innerHTML += `<option value="${staff.id}">${staff.name}</option>`;
        });
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

        // モーダル関連
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeTaskModal();
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.closeTaskModal();
        });

        document.getElementById('save-task-btn').addEventListener('click', () => {
            this.saveTask();
        });

        // モーダル外クリックで閉じる
        document.getElementById('task-modal').addEventListener('click', (e) => {
            if (e.target.id === 'task-modal') {
                this.closeTaskModal();
            }
        });
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

        // 担当者フィルター
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
            filtered = filtered.filter(task =>
                task.task_name.toLowerCase().includes(search) ||
                (task.clients?.name || '').toLowerCase().includes(search) ||
                (task.description || '').toLowerCase().includes(search)
            );
        }

        // ソート
        filtered.sort((a, b) => {
            const field = this.currentSort.field;
            let aVal = a[field];
            let bVal = b[field];

            // 特別な処理が必要なフィールド
            if (field === 'client_name') {
                aVal = a.clients?.name || '';
                bVal = b.clients?.name || '';
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

        // 期限の色分け
        const dueDateClass = this.getDueDateClass(task.due_date);
        const dueDateText = task.due_date ? formatDate(task.due_date) : '-';

        // ステータスバッジ
        const statusBadge = this.createStatusBadge(task.status);

        // アクションボタン
        const actionButtons = this.createActionButtons(task);

        tr.innerHTML = `
            <td><strong>${task.task_name}</strong>${task.description ? `<br><small class="text-muted">${task.description}</small>` : ''}</td>
            <td>${task.clients?.name || '-'}</td>
            <td>${task.assignee?.name || '-'}</td>
            <td>${task.requester?.name || '-'}</td>
            <td><span class="due-date ${dueDateClass}">${dueDateText}</span></td>
            <td>${statusBadge}</td>
            <td>${actionButtons}</td>
        `;

        return tr;
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

        // ステータスに応じたボタン
        if (task.status === '依頼中' && task.assignee_id === this.currentUser.id) {
            buttons.push(`<button class="btn btn-sm btn-complete" onclick="taskManager.updateTaskStatus(${task.id}, '作業完了')">完了</button>`);
        } else if (task.status === '作業完了' && task.requester_id === this.currentUser.id) {
            buttons.push(`<button class="btn btn-sm btn-confirm" onclick="taskManager.updateTaskStatus(${task.id}, '確認完了')">確認</button>`);
        }

        // 編集・削除ボタン
        buttons.push(`<button class="btn btn-sm btn-edit" onclick="taskManager.editTask(${task.id})">編集</button>`);

        if (task.requester_id === this.currentUser.id) {
            buttons.push(`<button class="btn btn-sm btn-delete" onclick="taskManager.deleteTask(${task.id})">削除</button>`);
        }

        return `<div class="action-buttons">${buttons.join('')}</div>`;
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

        // 各列にタスクカードを追加
        Object.entries(tasksByStatus).forEach(([status, statusTasks]) => {
            const containerId = status === '依頼中' ? 'tasks-pending' :
                               status === '作業完了' ? 'tasks-working' : 'tasks-completed';

            const container = document.getElementById(containerId);
            statusTasks.forEach(task => {
                const card = this.createTaskCard(task);
                container.appendChild(card);
            });
        });

        // ドラッグ&ドロップ初期化（今後実装）
        this.initializeSortable();
    }

    createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.taskId = task.id;

        const dueDateText = task.due_date ? formatDate(task.due_date) : '';
        const dueDateClass = this.getDueDateClass(task.due_date);

        card.innerHTML = `
            <div class="task-card-title">${task.task_name}</div>
            <div class="task-card-meta">
                <span class="task-card-client">${task.clients?.name || '-'}</span>
                <span class="task-card-assignee">${task.assignee?.name || '-'}</span>
            </div>
            ${task.description ? `<div class="task-card-description" style="font-size: 0.8rem; color: #6c757d; margin-top: 8px;">${task.description}</div>` : ''}
            ${dueDateText ? `<div class="task-card-due ${dueDateClass}">期限: ${dueDateText}</div>` : ''}
        `;

        // クリックで詳細表示
        card.addEventListener('click', () => {
            this.editTask(task.id);
        });

        return card;
    }

    initializeSortable() {
        // SortableJSを使用したドラッグ&ドロップ（今後実装）
        // 現在は基本表示のみ
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

    openTaskModal(taskId = null) {
        const modal = document.getElementById('task-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('task-form');

        form.reset();

        if (taskId) {
            title.textContent = 'タスク編集';
            // タスクデータを読み込んで編集モード
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                document.getElementById('task-name').value = task.task_name || '';
                document.getElementById('client-select').value = task.client_id || '';
                document.getElementById('assignee-select').value = task.assignee_id || '';
                document.getElementById('due-date').value = task.due_date || '';
                document.getElementById('estimated-hours').value = task.estimated_time_hours || '';
                document.getElementById('task-description').value = task.description || '';
                document.getElementById('reference-url').value = task.reference_url || '';
            }
            form.dataset.taskId = taskId;
        } else {
            title.textContent = '新規タスク作成';
            form.dataset.taskId = '';

            // デフォルト値設定
            if (this.currentUser) {
                document.getElementById('assignee-select').value = this.currentUser.id;
            }
        }

        modal.style.display = 'flex';
    }

    closeTaskModal() {
        const modal = document.getElementById('task-modal');
        modal.style.display = 'none';
    }

    async saveTask() {
        const form = document.getElementById('task-form');
        const taskId = form.dataset.taskId;
        const isEdit = !!taskId;

        // フォームデータ取得
        const taskData = {
            task_name: document.getElementById('task-name').value.trim(),
            client_id: parseInt(document.getElementById('client-select').value) || null,
            assignee_id: parseInt(document.getElementById('assignee-select').value) || null,
            due_date: document.getElementById('due-date').value || null,
            estimated_time_hours: parseFloat(document.getElementById('estimated-hours').value) || null,
            description: document.getElementById('task-description').value.trim() || null,
            reference_url: document.getElementById('reference-url').value.trim() || null
        };

        // バリデーション
        if (!taskData.task_name) {
            showToast('タスク名を入力してください', 'error');
            return;
        }

        if (!taskData.client_id) {
            showToast('事業者を選択してください', 'error');
            return;
        }

        if (!taskData.assignee_id) {
            showToast('担当者を選択してください', 'error');
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

    editTask(taskId) {
        this.openTaskModal(taskId);
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
}

// グローバルインスタンス
window.taskManager = new TaskManagement();