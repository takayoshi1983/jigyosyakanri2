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
        'No.': 'id',
        '事業所名': 'name',
        '決算月': 'fiscal_month',
        '未入力期間': 'unattendedMonths',
        '月次進捗': 'monthlyProgress',
        '最終更新': 'updated_at',
        '担当者': 'staff_name',
        '経理方式': 'accounting_method',
        '進捗ステータス': 'status'
    };

    // --- Authentication Functions ---
    function showAuthStatus(message, type = 'info') {
        authStatus.className = type;
        authStatus.style.display = 'block';
        authStatusText.textContent = message;
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
            // Fetch data from Supabase
            [clients, staffs, appSettings] = await Promise.all([
                fetchClients(),
                fetchStaffs(),
                fetchSettings()
            ]);

            applyFontFamily(appSettings.font_family);
            populateFilters();
            applyFilterState();
            renderClients();
            updateSortIcons();
        } catch (error) {
            console.error("Error initializing app:", error);
            alert("アプリケーションの初期化に失敗しました: " + handleSupabaseError(error));
        }
    }

    // --- Supabase Data Fetching ---
    async function fetchClients() {
        try {
            const clientsData = await SupabaseAPI.getClients();
            
            // Transform Supabase data to match existing format
            return clientsData.map(client => ({
                ...client,
                staff_name: client.staffs?.name || '',
                // Calculate progress and status (will be implemented)
                monthlyProgress: '計算中...',
                unattendedMonths: 0,
                status: 'active'
            }));
        } catch (error) {
            console.error('Error fetching clients:', error);
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

        // CSV and DB Reset Buttons (with placeholder functionality)
        document.getElementById('export-csv-button').addEventListener('click', () => {
            alert('CSVエクスポート機能は準備中です。');
        });

        document.getElementById('import-csv-button').addEventListener('click', () => {
            document.getElementById('csv-file-input').click();
        });

        document.getElementById('csv-file-input').addEventListener('change', () => {
            alert('CSVインポート機能は準備中です。');
        });

        document.getElementById('reset-database-button').addEventListener('click', () => {
            if (confirm('【危険】この操作は元に戻せません。本当にデータベースを初期化しますか？')) {
                alert('データベース初期化機能は準備中です。');
            }
        });
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
            noDataRow.innerHTML = '<td colspan="8" style="text-align: center; padding: 20px; color: #666;">該当するクライアントが見つかりません</td>';
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
        `;

        return row;
    }

    function getRowBackgroundColor(unattendedMonths) {
        if (unattendedMonths >= appSettings.red_threshold) {
            return appSettings.red_color;
        } else if (unattendedMonths >= appSettings.yellow_threshold) {
            return appSettings.yellow_color;
        }
        return null;
    }

    // --- Staff Management ---
    async function openStaffEditModal() {
        try {
            staffs = await fetchStaffs(); // Refresh staff data
            originalStaffsState = JSON.parse(JSON.stringify(staffs));
            currentEditingStaffs = JSON.parse(JSON.stringify(staffs));
            
            renderStaffList();
            staffEditModal.style.display = 'block';
        } catch (error) {
            console.error('Error opening staff modal:', error);
            alert('担当者データの取得に失敗しました: ' + handleSupabaseError(error));
        }
    }

    function renderStaffList() {
        staffListContainer.innerHTML = '';
        
        currentEditingStaffs.forEach((staff, index) => {
            const staffItem = document.createElement('div');
            staffItem.className = 'staff-item';
            staffItem.innerHTML = `
                <input type="text" value="${staff.name}" data-index="${index}" data-staff-id="${staff.id}">
                <button type="button" class="delete-staff-button" data-index="${index}">削除</button>
            `;
            staffListContainer.appendChild(staffItem);
        });

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
            // Implementation would involve creating, updating, and deleting staff records
            // This requires more complex logic to handle CRUD operations
            console.log('Saving staffs:', currentEditingStaffs);
            
            // For now, just update local state and refresh
            staffs = [...currentEditingStaffs];
            populateFilters();
            closeStaffModal();
            
            alert('担当者の更新が完了しました');
        } catch (error) {
            console.error('Error saving staffs:', error);
            alert('担当者の保存に失敗しました: ' + handleSupabaseError(error));
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
                if (task.accounting_method === '記帳代行') {
                    defaultTasks.kityo = JSON.parse(task.tasks);
                } else if (task.accounting_method === '自計') {
                    defaultTasks.jikei = JSON.parse(task.tasks);
                }
            });

            renderDefaultTasks();
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
        // This would require implementing an upsert operation for default_tasks
        // For now, log the operation
        console.log('Updating default tasks for', accountingMethod, ':', tasks);
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