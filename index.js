import { SupabaseAPI, handleSupabaseError } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Elements ---
    const authModal = document.getElementById('auth-modal');
    const signInButton = document.getElementById('signin-button');
    const signOutButton = document.getElementById('signout-button');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email');
    const userAvatar = document.getElementById('user-avatar');
    const authStatus = document.getElementById('auth-status');
    const authStatusText = document.getElementById('auth-status-text');

    // --- DOM Element Selectors ---
    const clientsTableBody = document.querySelector('#clients-table tbody');
    const searchInput = document.getElementById('search-input');
    const staffFilter = document.getElementById('staff-filter');
    const monthFilter = document.getElementById('month-filter');
    const clientsTableHeadRow = document.querySelector('#clients-table thead tr');
    
    // Staff modal elements
    const staffEditModal = document.getElementById('staff-edit-modal');
    const closeStaffModalButton = staffEditModal.querySelector('.close-button');
    const staffListContainer = document.getElementById('staff-list-container');
    const newStaffInput = document.getElementById('new-staff-input');
    const addStaffButton = document.getElementById('add-staff-button');
    const saveStaffButton = document.getElementById('save-staff-button');
    const cancelStaffButton = document.getElementById('cancel-staff-button');

    // Accordion and Default Tasks Modal elements
    const accordionHeader = document.querySelector('#management-accordion .accordion-header');
    const accordionContent = document.querySelector('#management-accordion .accordion-content');
    const defaultTasksModal = document.getElementById('default-tasks-modal');
    const openDefaultTasksModalButton = document.getElementById('default-tasks-settings-button');
    const closeDefaultTasksModalButton = defaultTasksModal.querySelector('.close-button');
    const saveDefaultTasksButton = document.getElementById('save-default-tasks-button');
    const cancelDefaultTasksButton = document.getElementById('cancel-default-tasks-button');
    const tasksKityoContainer = document.getElementById('tasks-kityo');
    const tasksJikeiContainer = document.getElementById('tasks-jikei');

    // Basic Settings Modal elements
    const basicSettingsModal = document.getElementById('basic-settings-modal');
    const openBasicSettingsModalButton = document.getElementById('basic-settings-button');
    const closeBasicSettingsModalButton = basicSettingsModal.querySelector('.close-button');
    const saveBasicSettingsButton = document.getElementById('save-basic-settings-button');
    const cancelBasicSettingsButton = document.getElementById('cancel-basic-settings-button');
    const yellowThresholdSelect = document.getElementById('yellow-threshold');
    const redThresholdSelect = document.getElementById('red-threshold');
    const yellowColorInput = document.getElementById('yellow-color');
    const redColorInput = document.getElementById('red-color');
    const fontFamilySelect = document.getElementById('font-family-select');
    const hideInactiveClientsCheckbox = document.getElementById('hide-inactive-clients');

    // --- State Variables ---
    let clients = [];
    let staffs = [];
    let currentSortKey = 'fiscal_month';
    let currentSortDirection = 'asc';
    let originalStaffsState = [];
    let currentEditingStaffs = [];
    let defaultTasks = {}; // State for default tasks
    let appSettings = {}; // State for application settings
    let filterState = {}; // フィルター状態を保存

    // --- Mappings ---
    const headerMap = {
        'ID': 'id',
        '事業所名': 'name',
        '決算月': 'fiscal_month',
        '未入力期間': 'unattendedMonths',
        '月次進捗': 'monthlyProgress',
        '最終更新': 'updated_at',
        '担当者': 'staff_name',
        '経理方式': 'accounting_method',
        '進捗ステータス': 'status'
    };

    // --- Status Display Functions ---
    function showStatus(message, type = 'info') {
        const connectionStatus = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');
        
        if (!connectionStatus || !statusText) return;
        
        connectionStatus.className = type;
        connectionStatus.style.display = 'block';
        statusText.textContent = message;
    }

    function hideStatus() {
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) connectionStatus.style.display = 'none';
    }

    // ローディング表示関数
    function showLoadingIndicator(message = 'データを読み込み中...') {
        const loadingIndicator = document.getElementById('loading-indicator');
        const loadingMessage = document.getElementById('loading-message');
        if (loadingIndicator && loadingMessage) {
            loadingMessage.textContent = message;
            loadingIndicator.style.display = 'block';
        }
    }

    function hideLoadingIndicator() {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    // --- Authentication Functions ---
    function showAuthStatus(message, type = 'info') {
        authStatus.className = type;
        authStatus.style.display = 'block';
        authStatusText.textContent = message;
    }

    function hideStatus() {
        if (authStatus) authStatus.style.display = 'none';
    }

    function hideAuthStatus() {
        authStatus.style.display = 'none';
    }

    async function signInWithGoogle() {
        try {
            showAuthStatus('Googleでログイン中...', 'warning');
            console.log('Starting Google sign in...');
            
            const { data, error } = await SupabaseAPI.signInWithGoogle();
            
            if (error) {
                console.error('Sign in error:', error);
                showAuthStatus('❌ ログインエラー: ' + error.message, 'error');
                return false;
            } else {
                console.log('Sign in success:', data);
                showAuthStatus('✅ ログイン成功！リダイレクト中...', 'success');
                return true;
            }
        } catch (error) {
            console.error('Sign in exception:', error);
            showAuthStatus('❌ ログインに失敗しました: ' + error.message, 'error');
            return false;
        }
    }

    async function signOut() {
        try {
            showAuthStatus('ログアウト中...', 'warning');
            await SupabaseAPI.signOut();
            showAuthStatus('✅ ログアウトしました', 'success');
            
            // Show auth modal again
            setTimeout(() => {
                authModal.style.display = 'flex';
                userInfo.style.display = 'none';
                hideAuthStatus();
            }, 1500);
        } catch (error) {
            console.error('Sign out error:', error);
            showAuthStatus('❌ ログアウトエラー: ' + error.message, 'error');
        }
    }

    function updateUserDisplay(user) {
        if (user) {
            userName.textContent = user.user_metadata?.full_name || user.email.split('@')[0];
            userEmail.textContent = user.email;
            
            if (user.user_metadata?.avatar_url) {
                userAvatar.src = user.user_metadata.avatar_url;
                userAvatar.style.display = 'block';
            }
            
            userInfo.style.display = 'block';
            authModal.style.display = 'none';
        } else {
            userInfo.style.display = 'none';
            authModal.style.display = 'flex';
        }
    }

    async function checkAuthState() {
        try {
            console.log('Checking authentication state...');
            const user = await SupabaseAPI.getCurrentUser();
            
            if (user) {
                console.log('User authenticated:', user.email);
                updateUserDisplay(user);
                return true;
            } else {
                console.log('User not authenticated - showing auth modal');
                authModal.style.display = 'flex';
                return false;
            }
        } catch (error) {
            console.error('Auth state check error:', error);
            authModal.style.display = 'flex';
            return false;
        }
    }

    // --- Auth Event Listeners ---
    function addAuthEventListeners() {
        if (signInButton) {
            signInButton.addEventListener('click', signInWithGoogle);
        }
        
        if (signOutButton) {
            signOutButton.addEventListener('click', signOut);
        }

        // Listen for auth state changes
        if (SupabaseAPI.supabase && SupabaseAPI.supabase.auth) {
            SupabaseAPI.supabase.auth.onAuthStateChange(async (event, session) => {
                console.log('Auth state changed:', event, session?.user?.email);
                
                if (event === 'SIGNED_IN' && session?.user) {
                    updateUserDisplay(session.user);
                    // Initialize app when user signs in
                    await initializeAuthenticatedApp();
                } else if (event === 'SIGNED_OUT') {
                    updateUserDisplay(null);
                }
            });
        }
    }

    // --- Initial Setup ---
    async function initializeApp() {
        console.log('[Main] Starting application initialization...');
        
        // Add auth event listeners first
        addAuthEventListeners();
        
        // Check authentication state
        const isAuthenticated = await checkAuthState();
        
        // Only initialize app if authenticated
        if (!isAuthenticated) {
            console.log('[Main] User not authenticated, showing auth modal');
            authModal.style.display = 'block';
            hideStatus();
            return;
        }
        
        await initializeAuthenticatedApp();
    }

    // Initialize app when authenticated
    async function initializeAuthenticatedApp() {
        setupTableHeaders();
        addEventListeners();
        populateMonthThresholds();
        populateFontFamilySelect();
        loadFilterState();
        
        try {
            // ローディング表示開始
            showLoadingIndicator('データを読み込み中...');
            
            // Fetch data from Supabase with optimized bulk loading
            [clients, staffs, appSettings] = await Promise.all([
                fetchClientsOptimized(),
                fetchStaffs(),
                fetchSettings()
            ]);

            applyFontFamily(appSettings.font_family);
            populateFilters();
            applyFilterState();
            renderClients();
            updateSortIcons();
            
            // ローディング表示終了
            hideLoadingIndicator();
        } catch (error) {
            hideLoadingIndicator();
            console.error("Error initializing app:", error);
            alert("アプリケーションの初期化に失敗しました: " + handleSupabaseError(error));
        }
    }

    // --- Supabase Data Fetching ---
    async function fetchClients() {
        try {
            const clientsData = await SupabaseAPI.getClients();
            
            const processedClients = [];
            for (const client of clientsData) {
                const allMonthlyTasks = await SupabaseAPI.getAllMonthlyTasksForClient(client.id);

                let latestCompletedMonth = '-';
                const completedMonths = [];

                if (allMonthlyTasks && allMonthlyTasks.length > 0) {
                    for (const taskMonth of allMonthlyTasks) {
                        const monthDate = new Date(taskMonth.month + '-01');
                        const month = monthDate.getMonth() + 1;
                        let fiscalYear = monthDate.getFullYear();
                        if (month <= client.fiscal_month) {
                            fiscalYear -= 1;
                        }

                        const customTasksForYear = client.custom_tasks_by_year?.[fiscalYear.toString()] || [];

                        if (customTasksForYear.length > 0) {
                            const allTasksCompleted = customTasksForYear.every(taskName => taskMonth.tasks?.[taskName] === true);
                            if (allTasksCompleted) {
                                completedMonths.push(taskMonth.month);
                            }
                        }
                    }
                }

                if (completedMonths.length > 0) {
                    completedMonths.sort().reverse();
                    latestCompletedMonth = completedMonths[0];
                }

                let unattendedMonths = '-';
                if (latestCompletedMonth !== '-') {
                    const completedDate = new Date(latestCompletedMonth + '-01');
                    const currentDate = new Date();
                    completedDate.setDate(1);
                    currentDate.setDate(1);

                    const diffYear = currentDate.getFullYear() - completedDate.getFullYear();
                    const diffMonth = currentDate.getMonth() - completedDate.getMonth();
                    
                    let totalMonths = diffYear * 12 + diffMonth;
                    totalMonths = totalMonths - 1; // Adjust for previous month
                    unattendedMonths = totalMonths >= 0 ? totalMonths : 0; // Ensure non-negative
                }

                processedClients.push({
                    ...client,
                    staff_name: client.staffs?.name || '',
                    monthlyProgress: latestCompletedMonth,
                    unattendedMonths: unattendedMonths,
                    status: 'active'
                });
            }
            return processedClients;

        } catch (error) {
            console.error('Error fetching clients:', error);
            throw error;
        }
    }

    // パフォーマンス最適化版クライアント取得
    async function fetchClientsOptimized() {
        try {
            // 並列で全データを取得（N+1問題解決）
            const [clientsData, allMonthlyTasks] = await Promise.all([
                SupabaseAPI.getClients(),
                SupabaseAPI.getAllMonthlyTasksForAllClients()
            ]);

            // クライアントIDごとにタスクをグループ化
            const tasksByClientId = {};
            for (const task of allMonthlyTasks) {
                if (!tasksByClientId[task.client_id]) {
                    tasksByClientId[task.client_id] = [];
                }
                tasksByClientId[task.client_id].push(task);
            }

            // 各クライアントの進捗計算
            const processedClients = clientsData.map(client => {
                const clientTasks = tasksByClientId[client.id] || [];
                
                let latestCompletedMonth = '-';
                const completedMonths = [];

                for (const taskMonth of clientTasks) {
                    const monthDate = new Date(taskMonth.month + '-01');
                    const month = monthDate.getMonth() + 1;
                    let fiscalYear = monthDate.getFullYear();
                    if (month <= client.fiscal_month) {
                        fiscalYear -= 1;
                    }

                    const customTasksForYear = client.custom_tasks_by_year?.[fiscalYear.toString()] || [];

                    if (customTasksForYear.length > 0) {
                        const allTasksCompleted = customTasksForYear.every(taskName => taskMonth.tasks?.[taskName] === true);
                        if (allTasksCompleted) {
                            completedMonths.push(taskMonth.month);
                        }
                    }
                }

                if (completedMonths.length > 0) {
                    completedMonths.sort().reverse();
                    latestCompletedMonth = completedMonths[0];
                }

                let unattendedMonths = '-';
                if (latestCompletedMonth !== '-') {
                    const completedDate = new Date(latestCompletedMonth + '-01');
                    const currentDate = new Date();
                    completedDate.setDate(1);
                    currentDate.setDate(1);

                    const diffYear = currentDate.getFullYear() - completedDate.getFullYear();
                    const diffMonth = currentDate.getMonth() - completedDate.getMonth();
                    
                    let totalMonths = diffYear * 12 + diffMonth;
                    totalMonths = totalMonths - 1;
                    unattendedMonths = totalMonths >= 0 ? totalMonths : 0;
                }

                return {
                    ...client,
                    staff_name: client.staffs?.name || '',
                    monthlyProgress: latestCompletedMonth,
                    unattendedMonths: unattendedMonths,
                    status: 'active'
                };
            });

            return processedClients;

        } catch (error) {
            console.error('Error fetching clients (optimized):', error);
            throw error;
        }
    }

    async function fetchStaffs() {
        try {
            return await SupabaseAPI.getStaffs();
        } catch (error) {
            console.error('Error fetching staffs:', error);
            throw error;
        }
    }

    async function fetchSettings() {
        try {
            const [yellowThreshold, redThreshold, yellowColor, redColor, fontFamily, hideInactive] = await Promise.all([
                SupabaseAPI.getSetting('yellow_threshold'),
                SupabaseAPI.getSetting('red_threshold'),
                SupabaseAPI.getSetting('yellow_color'),
                SupabaseAPI.getSetting('red_color'),
                SupabaseAPI.getSetting('font_family'),
                SupabaseAPI.getSetting('hide_inactive_clients')
            ]);

            return {
                yellow_threshold: yellowThreshold || 2,
                red_threshold: redThreshold || 3,
                yellow_color: yellowColor || '#FFFF99',
                red_color: redColor || '#FFCDD2',
                font_family: fontFamily || 'Noto Sans JP',
                hide_inactive_clients: hideInactive || false
            };
        } catch (error) {
            console.error('Error fetching settings:', error);
            return {
                yellow_threshold: 2,
                red_threshold: 3,
                yellow_color: '#FFFF99',
                red_color: '#FFCDD2',
                font_family: 'Noto Sans JP',
                hide_inactive_clients: false
            };
        }
    }

    async function fetchDefaultTasksForAccounting(accountingMethod) {
        try {
            const tasks = await SupabaseAPI.getDefaultTasks();
            const methodTasks = tasks.find(t => t.accounting_method === accountingMethod);
            return methodTasks ? JSON.parse(methodTasks.tasks) : [];
        } catch (error) {
            console.error('Error fetching default tasks:', error);
            return [];
        }
    }

    // --- Event Listeners ---
    function addEventListeners() {
        // Search functionality
        searchInput.addEventListener('input', debounce(handleSearch, 300));
        
        // Filter functionality
        staffFilter.addEventListener('change', handleFilterChange);
        monthFilter.addEventListener('change', handleFilterChange);

        // Staff modal
        document.getElementById('manage-staff-button').addEventListener('click', openStaffEditModal);
        closeStaffModalButton.addEventListener('click', closeStaffModal);
        addStaffButton.addEventListener('click', addStaffInputField);
        saveStaffButton.addEventListener('click', saveStaffs);
        cancelStaffButton.addEventListener('click', closeStaffModal);

        // Default Tasks modal
        openDefaultTasksModalButton.addEventListener('click', openDefaultTasksModal);
        closeDefaultTasksModalButton.addEventListener('click', closeDefaultTasksModal);
        saveDefaultTasksButton.addEventListener('click', saveDefaultTasks);
        cancelDefaultTasksButton.addEventListener('click', closeDefaultTasksModal);

        // Basic Settings modal
        openBasicSettingsModalButton.addEventListener('click', openBasicSettingsModal);
        closeBasicSettingsModalButton.addEventListener('click', closeBasicSettingsModal);
        saveBasicSettingsButton.addEventListener('click', saveBasicSettings);
        cancelBasicSettingsButton.addEventListener('click', closeBasicSettingsModal);

        // Accordion
        accordionHeader.addEventListener('click', toggleAccordion);

        // Table header sorting
        clientsTableHeadRow.addEventListener('click', handleSort);

        // Client click handler
        clientsTableBody.addEventListener('click', handleClientClick);

        // Add client button
        document.getElementById('add-client-button').addEventListener('click', () => {
            window.location.href = 'edit.html';
        });

        // Window click to close modal
        window.addEventListener('click', (e) => {
            if (e.target === staffEditModal) closeStaffModal();
            if (e.target === defaultTasksModal) closeDefaultTasksModal();
            if (e.target === basicSettingsModal) closeBasicSettingsModal();
        });

        // CSV and DB Reset Buttons
        document.getElementById('export-csv-button').addEventListener('click', exportCSV);
        document.getElementById('import-csv-button').addEventListener('click', () => {
            document.getElementById('csv-file-input').click();
        });
        document.getElementById('csv-file-input').addEventListener('change', importCSV);
        document.getElementById('reset-database-button').addEventListener('click', resetDatabase);
    }

    // --- Client Management ---
    async function handleClientClick(e) {
        const clientRow = e.target.closest('tr');
        if (!clientRow) return;

        const clientId = clientRow.getAttribute('data-client-id');
        if (clientId) {
            // Check if client needs initial task setup based on accounting method
            const client = clients.find(c => c.id.toString() === clientId);
            if (client && needsInitialTaskSetup(client)) {
                await setupInitialTasks(client);
            }
            
            // Navigate to client detail page
            window.location.href = `details.html?id=${clientId}`;
        }
    }

    function needsInitialTaskSetup(client) {
        // Check if client has custom tasks for current year
        const currentYear = new Date().getFullYear();
        const customTasks = client.custom_tasks_by_year;
        
        if (!customTasks || typeof customTasks !== 'object') return true;
        if (!customTasks[currentYear] || !Array.isArray(customTasks[currentYear])) return true;
        if (customTasks[currentYear].length === 0) return true;
        
        return false;
    }

    async function setupInitialTasks(client) {
        try {
            const accountingMethod = client.accounting_method;
            if (!accountingMethod || !['記帳代行', '自計'].includes(accountingMethod)) {
                console.warn('Unknown accounting method for client:', client.id, accountingMethod);
                return;
            }

            // Get default tasks for this accounting method
            const defaultTaskList = await fetchDefaultTasksForAccounting(accountingMethod);
            if (defaultTaskList.length === 0) {
                console.warn('No default tasks found for accounting method:', accountingMethod);
                return;
            }

            // Update client with initial tasks
            const currentYear = new Date().getFullYear();
            const customTasksByYear = client.custom_tasks_by_year || {};
            customTasksByYear[currentYear] = defaultTaskList;

            // Update client in database
            await SupabaseAPI.updateClient(client.id, {
                custom_tasks_by_year: customTasksByYear
            });

            console.log('Initial tasks set up for client:', client.name, 'Method:', accountingMethod, 'Tasks:', defaultTaskList);
        } catch (error) {
            console.error('Error setting up initial tasks for client:', client.id, error);
        }
    }

    // --- Rendering Functions ---
    function renderClients() {
        if (!clientsTableBody) return;

        const filteredClients = getFilteredClients();
        const sortedClients = sortClients(filteredClients);

        clientsTableBody.innerHTML = '';

        if (sortedClients.length === 0) {
            const noDataRow = document.createElement('tr');
            noDataRow.innerHTML = '<td colspan="10" style="text-align: center; padding: 20px; color: #666;">該当するクライアントが見つかりません</td>';
            clientsTableBody.appendChild(noDataRow);
            return;
        }

        sortedClients.forEach(client => {
            const row = createClientRow(client);
            clientsTableBody.appendChild(row);
        });
    }

    function createClientRow(client) {
        const row = document.createElement('tr');
        row.setAttribute('data-client-id', client.id);
        row.style.cursor = 'pointer';
        
        // Apply background color based on unattended months
        const bgColor = getRowBackgroundColor(client.unattendedMonths);
        if (bgColor) {
            row.style.backgroundColor = bgColor;
        }

        const fiscalMonth = client.fiscal_month ? `${client.fiscal_month}月` : '-';
        const staffName = client.staff_name || '-';
        const accountingMethod = client.accounting_method || '-';
        const updatedAt = client.updated_at ? 
            new Date(client.updated_at).toLocaleDateString('ja-JP') : '-';

        row.innerHTML = `
            <td>${client.id}</td>
            <td title="${client.name}">${client.name}</td>
            <td>${fiscalMonth}</td>
            <td>${client.unattendedMonths}ヶ月</td>
            <td>${client.monthlyProgress}</td>
            <td>${updatedAt}</td>
            <td>${staffName}</td>
            <td>${accountingMethod}</td>
            <td>
                <span class="status-indicator ${client.status === 'active' ? 'status-active' : 'status-inactive'}">
                    ${client.status === 'active' ? '稼働中' : '停止中'}
                </span>
            </td>
            <td>
                <button class="edit-btn" onclick="window.editClient(${client.id}, event)" title="編集">
                    編集
                </button>
            </td>
        `;

        return row;
    }

    // 編集画面に遷移
    function editClient(clientId, event) {
        if (event) event.stopPropagation(); // Prevent row click
        window.location.href = `edit.html?id=${clientId}`;
    }

    // グローバルスコープでアクセス可能にする
    window.editClient = editClient;

    function getRowBackgroundColor(unattendedMonths) {
        if (unattendedMonths >= appSettings.red_threshold) {
            return appSettings.red_color;
        } else if (unattendedMonths >= appSettings.yellow_threshold) {
            return appSettings.yellow_color;
        }
        return null;
    }

    // --- Staff Management ---
    function openStaffEditModal() {
        try {
            // キャッシュされたstaffsデータを使用（DB問い合わせ不要）
            originalStaffsState = JSON.parse(JSON.stringify(staffs));
            currentEditingStaffs = JSON.parse(JSON.stringify(staffs));
            
            renderStaffList();
            staffEditModal.style.display = 'block';
        } catch (error) {
            console.error('Error opening staff modal:', error);
            alert('担当者データの表示に失敗しました: ' + error.message);
        }
    }

    function renderStaffList() {
        staffListContainer.innerHTML = '';
        
        // キャッシュされたclientsデータから担当件数を計算（DB問い合わせ不要）
        const staffClientCounts = {};
        const staffAssignedClients = {};
        
        for (const client of clients) {
            if (client.staff_id) {
                if (!staffClientCounts[client.staff_id]) {
                    staffClientCounts[client.staff_id] = 0;
                    staffAssignedClients[client.staff_id] = [];
                }
                staffClientCounts[client.staff_id]++;
                staffAssignedClients[client.staff_id].push(client);
            }
        }
        
        for (let index = 0; index < currentEditingStaffs.length; index++) {
            const staff = currentEditingStaffs[index];
            const clientCount = staff.id !== null ? (staffClientCounts[staff.id] || 0) : 0;
            const assignedClients = staff.id !== null ? (staffAssignedClients[staff.id] || []) : [];
            
            const staffItem = document.createElement('div');
            staffItem.className = 'staff-item';
            
            const clientInfo = clientCount > 0 ? 
                ` <span class="client-count" title="担当クライアント: ${assignedClients.map(c => c.name).join(', ')}" style="color: #666; font-size: 0.9em; margin: 0 8px;">(${clientCount}件担当)</span>` : 
                '';
            
            const deleteButtonDisabled = clientCount > 0 ? 'disabled title="担当しているクライアントがあるため削除できません" style="opacity: 0.5; cursor: not-allowed;"' : '';
            
            staffItem.innerHTML = `
                <input type="text" value="${staff.name}" data-index="${index}" data-staff-id="${staff.id}" style="flex: 1; margin-right: 10px;">
                ${clientInfo}
                <button type="button" class="delete-staff-button" data-index="${index}" ${deleteButtonDisabled}>削除</button>
            `;
            staffItem.style.display = 'flex';
            staffItem.style.alignItems = 'center';
            staffItem.style.marginBottom = '10px';
            staffListContainer.appendChild(staffItem);
        }

        // Add event listeners for delete buttons
        staffListContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-staff-button')) {
                const index = parseInt(e.target.getAttribute('data-index'));
                currentEditingStaffs.splice(index, 1);
                renderStaffList();
            }
        });

        // Add event listeners for input changes
        staffListContainer.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT') {
                const index = parseInt(e.target.getAttribute('data-index'));
                currentEditingStaffs[index].name = e.target.value;
            }
        });
    }

    function addStaffInputField() {
        const newStaffName = newStaffInput.value.trim();
        if (newStaffName) {
            currentEditingStaffs.push({
                id: null, // New staff will get ID from database
                name: newStaffName
            });
            renderStaffList();
            newStaffInput.value = '';
        }
    }

    async function saveStaffs() {
        try {
            // Compare original and current staffs to determine what operations are needed
            const originalIds = originalStaffsState.map(s => s.id);
            const currentIds = currentEditingStaffs.map(s => s.id).filter(id => id !== null);
            
            // Find staffs to delete (removed from current list)
            const toDelete = originalStaffsState.filter(original => 
                !currentEditingStaffs.some(current => current.id === original.id)
            );
            
            // Find staffs to update (existing IDs with changed names)
            const toUpdate = currentEditingStaffs.filter(current => 
                current.id !== null && 
                originalStaffsState.some(original => 
                    original.id === current.id && original.name !== current.name
                )
            );
            
            // Find staffs to create (null IDs)
            const toCreate = currentEditingStaffs.filter(current => current.id === null);
            
            console.log('Staff operations:', { toDelete, toUpdate, toCreate });
            
            // Execute operations
            const operations = [];
            
            // Delete operations
            for (const staff of toDelete) {
                operations.push(SupabaseAPI.deleteStaff(staff.id));
            }
            
            // Update operations
            for (const staff of toUpdate) {
                operations.push(SupabaseAPI.updateStaff(staff.id, { name: staff.name }));
            }
            
            // Create operations
            for (const staff of toCreate) {
                operations.push(SupabaseAPI.createStaff({ name: staff.name }));
            }
            
            // Execute all operations
            await Promise.all(operations);
            
            // Refresh staff data from database
            staffs = await fetchStaffs();
            populateFilters();
            closeStaffModal();
            
            alert('担当者の更新が完了しました');
        } catch (error) {
            console.error('Error saving staffs:', error);
            
            if (error.name === 'StaffAssignedError') {
                alert(error.message + '\n\n先にクライアントの担当者を変更してから削除してください。');
            } else {
                alert('担当者の保存に失敗しました: ' + handleSupabaseError(error));
            }
        }
    }

    function closeStaffModal() {
        staffEditModal.style.display = 'none';
        currentEditingStaffs = [];
        originalStaffsState = [];
        newStaffInput.value = '';
    }

    // --- Settings Management ---
    async function openBasicSettingsModal() {
        try {
            appSettings = await fetchSettings();
            
            // Populate form with current settings
            yellowThresholdSelect.value = appSettings.yellow_threshold;
            redThresholdSelect.value = appSettings.red_threshold;
            yellowColorInput.value = appSettings.yellow_color;
            redColorInput.value = appSettings.red_color;
            fontFamilySelect.value = appSettings.font_family;
            hideInactiveClientsCheckbox.checked = appSettings.hide_inactive_clients;
            
            basicSettingsModal.style.display = 'block';
        } catch (error) {
            console.error('Error opening basic settings modal:', error);
            alert('設定の取得に失敗しました: ' + handleSupabaseError(error));
        }
    }

    async function saveBasicSettings() {
        try {
            const newSettings = {
                yellow_threshold: parseInt(yellowThresholdSelect.value),
                red_threshold: parseInt(redThresholdSelect.value),
                yellow_color: yellowColorInput.value,
                red_color: redColorInput.value,
                font_family: fontFamilySelect.value,
                hide_inactive_clients: hideInactiveClientsCheckbox.checked
            };

            // Save settings to Supabase
            await Promise.all([
                SupabaseAPI.setSetting('yellow_threshold', newSettings.yellow_threshold),
                SupabaseAPI.setSetting('red_threshold', newSettings.red_threshold),
                SupabaseAPI.setSetting('yellow_color', newSettings.yellow_color),
                SupabaseAPI.setSetting('red_color', newSettings.red_color),
                SupabaseAPI.setSetting('font_family', newSettings.font_family),
                SupabaseAPI.setSetting('hide_inactive_clients', newSettings.hide_inactive_clients)
            ]);

            appSettings = newSettings;
            applyFontFamily(appSettings.font_family);
            renderClients(); // Re-render with new color settings
            
            closeBasicSettingsModal();
            alert('設定が保存されました');
        } catch (error) {
            console.error('Error saving basic settings:', error);
            alert('設定の保存に失敗しました: ' + handleSupabaseError(error));
        }
    }

    function closeBasicSettingsModal() {
        basicSettingsModal.style.display = 'none';
    }

    // --- Default Tasks Management ---
    async function openDefaultTasksModal() {
        try {
            const tasks = await SupabaseAPI.getDefaultTasks();
            
            defaultTasks = {
                kityo: [],
                jikei: []
            };
            
            tasks.forEach(task => {
                try {
                    let taskData;
                    if (typeof task.tasks === 'string') {
                        taskData = JSON.parse(task.tasks);
                    } else if (Array.isArray(task.tasks)) {
                        taskData = task.tasks;
                    } else {
                        console.warn('Invalid task data format:', task.tasks);
                        taskData = [];
                    }

                    if (task.accounting_method === '記帳代行') {
                        defaultTasks.kityo = taskData;
                    } else if (task.accounting_method === '自計') {
                        defaultTasks.jikei = taskData;
                    }
                } catch (error) {
                    console.error('Error parsing task data for', task.accounting_method, ':', error);
                    // エラーが発生した場合はデフォルト値を使用
                    if (task.accounting_method === '記帳代行') {
                        defaultTasks.kityo = ['資料受付', '仕訳入力', '担当チェック', '不明投げかけ', '月次完了'];
                    } else if (task.accounting_method === '自計') {
                        defaultTasks.jikei = ['データ受領', '仕訳チェック', '不明投げかけ', '月次完了'];
                    }
                }
            });

            renderDefaultTasks();
            setupAddButtonListeners();
            defaultTasksModal.style.display = 'block';
        } catch (error) {
            console.error('Error opening default tasks modal:', error);
            alert('初期項目の取得に失敗しました: ' + handleSupabaseError(error));
        }
    }

    function renderDefaultTasks() {
        renderTaskList('kityo', tasksKityoContainer);
        renderTaskList('jikei', tasksJikeiContainer);
    }

    function setupAddButtonListeners() {
        // 追加ボタンのイベントリスナーを設定
        document.querySelectorAll('button[data-target]').forEach(button => {
            const newListener = (e) => {
                const target = e.target.getAttribute('data-target');
                const input = document.getElementById(`new-task-${target}`);
                const taskName = input.value.trim();
                
                if (taskName) {
                    if (!defaultTasks[target]) defaultTasks[target] = [];
                    defaultTasks[target].push(taskName);
                    input.value = '';
                    renderTaskList(target, target === 'kityo' ? tasksKityoContainer : tasksJikeiContainer);
                }
            };
            
            // 既存のリスナーを削除してから新しいリスナーを追加
            button.removeEventListener('click', button._addTaskListener);
            button.addEventListener('click', newListener);
            button._addTaskListener = newListener;
        });
    }

    function renderTaskList(type, container) {
        container.innerHTML = '';
        
        defaultTasks[type].forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `
                <input type="text" value="${task}" data-type="${type}" data-index="${index}">
                <button type="button" class="delete-task-button" data-type="${type}" data-index="${index}">削除</button>
            `;
            container.appendChild(taskItem);
        });

        // Add event listeners
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-task-button')) {
                const type = e.target.getAttribute('data-type');
                const index = parseInt(e.target.getAttribute('data-index'));
                defaultTasks[type].splice(index, 1);
                renderTaskList(type, type === 'kityo' ? tasksKityoContainer : tasksJikeiContainer);
            }
        });

        container.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT') {
                const type = e.target.getAttribute('data-type');
                const index = parseInt(e.target.getAttribute('data-index'));
                defaultTasks[type][index] = e.target.value;
            }
        });
    }

    async function saveDefaultTasks() {
        try {
            // Save both accounting methods
            const promises = [];
            
            if (defaultTasks.kityo && defaultTasks.kityo.length > 0) {
                // Find and update or create the 記帳代行 task
                promises.push(updateDefaultTask('記帳代行', defaultTasks.kityo));
            }
            
            if (defaultTasks.jikei && defaultTasks.jikei.length > 0) {
                // Find and update or create the 自計 task
                promises.push(updateDefaultTask('自計', defaultTasks.jikei));
            }

            await Promise.all(promises);
            
            closeDefaultTasksModal();
            alert('初期項目の設定が保存されました');
        } catch (error) {
            console.error('Error saving default tasks:', error);
            alert('初期項目の保存に失敗しました: ' + handleSupabaseError(error));
        }
    }

    async function updateDefaultTask(accountingMethod, tasks) {
        try {
            await SupabaseAPI.upsertDefaultTasks(accountingMethod, tasks);
            console.log('Updated default tasks for', accountingMethod, ':', tasks);
        } catch (error) {
            console.error('Error updating default tasks:', error);
            throw error;
        }
    }

    function closeDefaultTasksModal() {
        defaultTasksModal.style.display = 'none';
        defaultTasks = {};
    }

    // --- Utility Functions ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function handleSearch() {
        renderClients();
        saveFilterState();
    }

    function handleFilterChange() {
        renderClients();
        saveFilterState();
    }

    function getFilteredClients() {
        return clients.filter(client => {
            // Search filter
            const searchTerm = searchInput.value.toLowerCase();
            const matchesSearch = !searchTerm || 
                client.name.toLowerCase().includes(searchTerm) ||
                client.staff_name?.toLowerCase().includes(searchTerm);

            // Staff filter
            const staffFilterValue = staffFilter.value;
            const matchesStaff = !staffFilterValue || client.staff_id?.toString() === staffFilterValue;

            // Month filter
            const monthFilterValue = monthFilter.value;
            const matchesMonth = !monthFilterValue || client.fiscal_month?.toString() === monthFilterValue;

            // Hide inactive filter
            const showInactive = !appSettings.hide_inactive_clients;
            const matchesStatus = showInactive || client.status === 'active';

            return matchesSearch && matchesStaff && matchesMonth && matchesStatus;
        });
    }

    function sortClients(clientList) {
        return clientList.sort((a, b) => {
            let aValue = a[currentSortKey];
            let bValue = b[currentSortKey];

            // Handle different data types
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue === bValue) return 0;

            const result = aValue < bValue ? -1 : 1;
            return currentSortDirection === 'asc' ? result : -result;
        });
    }

    // --- Setup Functions ---
    function setupTableHeaders() {
        if (!clientsTableHeadRow) return;

        const headers = clientsTableHeadRow.querySelectorAll('th');
        headers.forEach((header, index) => {
            const headerText = header.textContent.trim();
            const sortKey = headerMap[headerText];
            
            if (sortKey && sortKey !== 'monthlyProgress') {
                header.style.cursor = 'pointer';
                header.setAttribute('data-sort-key', sortKey);
                
                const icon = document.createElement('span');
                icon.className = 'sort-icon';
                icon.innerHTML = '↕️';
                header.appendChild(icon);
            }
        });
    }

    function handleSort(e) {
        const header = e.target.closest('th');
        if (!header) return;

        const sortKey = header.getAttribute('data-sort-key');
        if (!sortKey) return;

        if (currentSortKey === sortKey) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortKey = sortKey;
            currentSortDirection = 'asc';
        }

        renderClients();
        updateSortIcons();
    }

    function updateSortIcons() {
        const headers = clientsTableHeadRow.querySelectorAll('th');
        headers.forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (!icon) return;

            const sortKey = header.getAttribute('data-sort-key');
            if (sortKey === currentSortKey) {
                icon.innerHTML = currentSortDirection === 'asc' ? '↑' : '↓';
                icon.style.opacity = '1';
            } else {
                icon.innerHTML = '↕️';
                icon.style.opacity = '0.5';
            }
        });
    }

    function populateFilters() {
        populateStaffFilter();
        populateMonthFilter();
        if (window.initializeAllDropdowns) {
            window.initializeAllDropdowns();
        }
        // フィルタ初期化後にカスタムドロップダウンの表示を更新
        setTimeout(updateCustomDropdownTriggers, 100);
    }

    function populateStaffFilter() {
        staffFilter.innerHTML = '<option value="">すべての担当者</option>';
        
        const uniqueStaffs = [...new Set(staffs.map(s => s.id))];
        uniqueStaffs.forEach(staffId => {
            const staff = staffs.find(s => s.id === staffId);
            if (staff) {
                const option = document.createElement('option');
                option.value = staff.id;
                option.textContent = staff.name;
                staffFilter.appendChild(option);
            }
        });
    }

    function populateMonthFilter() {
        monthFilter.innerHTML = '<option value="">すべての決算月</option>';
        
        for (let month = 1; month <= 12; month++) {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = `${month}月`;
            monthFilter.appendChild(option);
        }
    }

    function populateMonthThresholds() {
        [yellowThresholdSelect, redThresholdSelect].forEach(select => {
            select.innerHTML = '';
            for (let i = 1; i <= 12; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i}ヶ月`;
                select.appendChild(option);
            }
        });
    }

    function populateFontFamilySelect() {
        const fonts = [
            'Noto Sans JP',
            'Hiragino Sans',
            'Yu Gothic',
            'Meiryo',
            'MS Gothic',
            'Arial',
            'Helvetica'
        ];

        fontFamilySelect.innerHTML = '';
        fonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font;
            option.textContent = font;
            fontFamilySelect.appendChild(option);
        });
    }

    function applyFontFamily(fontFamily) {
        if (fontFamily) {
            document.body.style.fontFamily = fontFamily;
        }
    }

    // --- State Management ---
    function loadFilterState() {
        const saved = localStorage.getItem('filterState');
        if (saved) {
            try {
                filterState = JSON.parse(saved);
            } catch (error) {
                console.error('Error loading filter state:', error);
                filterState = {};
            }
        }
    }

    function saveFilterState() {
        filterState = {
            search: searchInput.value,
            staff: staffFilter.value,
            month: monthFilter.value
        };
        localStorage.setItem('filterState', JSON.stringify(filterState));
    }

    function applyFilterState() {
        if (filterState.search) searchInput.value = filterState.search;
        if (filterState.staff) staffFilter.value = filterState.staff;
        if (filterState.month) monthFilter.value = filterState.month;
        
        // カスタムドロップダウンの表示も更新
        updateCustomDropdownTriggers();
    }

    function updateCustomDropdownTriggers() {
        // 担当者ドロップダウンの表示更新
        const staffTrigger = document.querySelector('#staff-filter').parentElement.querySelector('.custom-select-trigger');
        if (staffTrigger) {
            const selectedStaffOption = staffFilter.options[staffFilter.selectedIndex];
            staffTrigger.textContent = selectedStaffOption ? selectedStaffOption.textContent : 'すべての担当者';
        }
        
        // 決算月ドロップダウンの表示更新
        const monthTrigger = document.querySelector('#month-filter').parentElement.querySelector('.custom-select-trigger');
        if (monthTrigger) {
            const selectedMonthOption = monthFilter.options[monthFilter.selectedIndex];
            monthTrigger.textContent = selectedMonthOption ? selectedMonthOption.textContent : 'すべての決算月';
        }
    }

    // --- CSV Export/Import Functions ---
    async function exportCSV() {
        try {
            showStatus('CSVエクスポート中...', 'warning');
            
            const csvData = await SupabaseAPI.exportClientsCSV();
            
            // CSV文字列を生成
            const csvString = csvData.map(row => 
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ).join('\n');
            
            // UTF-8 BOMを追加（Excelでの文字化け防止）
            const bom = '\uFEFF';
            const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
            
            // ダウンロードを実行
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `clients_${new Date().toISOString().slice(0,10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showStatus('✅ CSVエクスポート完了', 'success');
            setTimeout(hideStatus, 2000);
        } catch (error) {
            console.error('CSV export error:', error);
            showStatus(`❌ エクスポートエラー: ${handleSupabaseError(error)}`, 'error');
        }
    }
    
    async function importCSV(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('CSVファイルを選択してください。');
            return;
        }
        
        try {
            showStatus('CSVインポート中...', 'warning');
            
            // ファイルを読み込み
            const text = await readFileAsText(file);
            const csvData = parseCSV(text);
            
            if (csvData.length < 2) {
                throw new Error('CSVファイルにデータが含まれていません');
            }
            
            // インポート実行の確認
            const confirmMessage = `${csvData.length - 1}行のデータをインポートします。\n既存データの変更と新規追加が行われる可能性があります。\n実行しますか？`;
            if (!confirm(confirmMessage)) {
                hideStatus();
                return;
            }
            
            // インポート実行
            const result = await SupabaseAPI.importClientsCSV(csvData);
            
            if (result.success) {
                showStatus(`✅ ${result.message}`, 'success');
                
                // データを再読み込み
                clients = await fetchClientsOptimized();
                renderClients();
                populateFilters();
                
                alert(`インポートが完了しました。\n${result.message}`);
            }
        } catch (error) {
            console.error('CSV import error:', error);
            showStatus(`❌ インポートエラー: ${handleSupabaseError(error)}`, 'error');
            alert(`インポートに失敗しました:\n${error.message}`);
        } finally {
            // ファイル入力をクリア
            event.target.value = '';
            hideStatus();
        }
    }
    
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            
            // 複数エンコーディング対応
            try {
                reader.readAsText(file, 'UTF-8');
            } catch (error) {
                try {
                    reader.readAsText(file, 'Shift_JIS');
                } catch (error2) {
                    reader.readAsText(file);
                }
            }
        });
    }
    
    function parseCSV(text) {
        const lines = text.split(/\r?\n/);
        const result = [];
        
        for (const line of lines) {
            if (line.trim() === '') continue;
            
            const row = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        current += '"';
                        i++; // Skip next quote
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    row.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            
            row.push(current);
            result.push(row);
        }
        
        return result;
    }
    
    // --- Database Reset Function ---
    async function resetDatabase() {
        const firstConfirm = confirm('⚠️ 危険な操作です ⚠️\n\nこの操作により以下が実行されます：\n• 全てのクライアントデータが削除されます\n• 全ての月次タスクデータが削除されます\n• サンプルデータで初期化されます\n\nこの操作は元に戻せません。続行しますか？');
        
        if (!firstConfirm) return;
        
        const secondConfirm = confirm('本当に実行しますか？\n\n全てのデータが失われます。\n「はい」をクリックすると実行されます。');
        
        if (!secondConfirm) return;
        
        try {
            showStatus('データベースを初期化中... この処理には時間がかかります', 'warning');
            
            const result = await SupabaseAPI.resetDatabase();
            
            if (result.success) {
                showStatus('✅ データベース初期化完了', 'success');
                
                // データを再読み込み
                [clients, staffs, appSettings] = await Promise.all([
                    fetchClientsOptimized(),
                    fetchStaffs(),
                    fetchSettings()
                ]);
                
                populateFilters();
                renderClients();
                
                alert('データベースの初期化が完了しました。\nサンプルデータが設定されました。');
            }
        } catch (error) {
            console.error('Database reset error:', error);
            showStatus(`❌ 初期化エラー: ${handleSupabaseError(error)}`, 'error');
            alert(`データベース初期化に失敗しました:\n${error.message}`);
        }
    }

    // --- Accordion ---
    function toggleAccordion() {
        const isExpanded = accordionContent.style.display === 'block';
        accordionContent.style.display = isExpanded ? 'none' : 'block';
        
        const icon = accordionHeader.querySelector('.accordion-icon');
        if (icon) {
            icon.textContent = isExpanded ? '▼' : '▲';
        }
    }

    // Initialize the application
    initializeApp();
});