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
    let staffListContainer = document.getElementById('staff-list-container');
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

    // Other Apps Accordion elements
    const otherAppsAccordion = document.getElementById('other-apps-accordion');
    const otherAppsAccordionHeader = otherAppsAccordion.querySelector('.accordion-header');
    const otherAppsAccordionContent = otherAppsAccordion.querySelector('.accordion-content');
    const urlSettingsButton = document.getElementById('url-settings-button');

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

    // URL Settings Modal elements
    const urlSettingsModal = document.getElementById('url-settings-modal');
    const closeUrlSettingsModalButton = urlSettingsModal.querySelector('.close-button');
    const urlListContainer = document.getElementById('url-list-container');
    const newUrlNameInput = document.getElementById('new-url-name');
    const newUrlLinkInput = document.getElementById('new-url-link');
    const addUrlButton = document.getElementById('add-url-button');
    const saveUrlSettingsButton = document.getElementById('save-url-settings-button');
    const cancelUrlSettingsButton = document.getElementById('cancel-url-settings-button');

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
    let appLinks = []; // State for app links
    let originalAppLinksState = [];
    let currentEditingAppLinks = [];
    let sortableUrlList = null;

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

    // --- Table Column Width Management ---
    function resetColumnWidths() {
        if (window.tableResizer) {
            window.tableResizer.resetColumnWidths();
        } else {
            toast.warning('テーブルリサイザーが初期化されていません');
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
        try {
            const authCheckToast = toast.loading('ユーザー権限を確認中...');

            const userRole = await SupabaseAPI.getUserRole();

            // Check if user is registered in the staffs table
            if (userRole === null) {
                console.warn('Unauthorized user. Showing access denied modal.');
                toast.hide(authCheckToast);

                // Blur the background and show the custom access denied modal
                const mainContainer = document.querySelector('.container');
                if (mainContainer) mainContainer.classList.add('blur-background');
                
                const accessDeniedModal = document.getElementById('access-denied-modal');
                if (accessDeniedModal) accessDeniedModal.style.display = 'flex';

                // Set up the button to sign out and reload
                const okButton = document.getElementById('access-denied-ok-button');
                if (okButton) {
                    okButton.onclick = async () => {
                        // To prevent multiple clicks, disable the button
                        okButton.disabled = true;
                        okButton.textContent = '処理中...';
                        await SupabaseAPI.signOut();
                        window.location.reload();
                    };
                }

                return; // Stop further execution
            }

            // If user is registered, proceed with setup and UI customization
            setupTableHeaders();
            addEventListeners();
            populateMonthThresholds();
            populateFontFamilySelect();
            loadFilterState();

            // Disable admin buttons if user is not an admin
            if (userRole !== 'admin') {
                console.log(`User role is '${userRole}'. Disabling admin buttons.`);
                const manageStaffButton = document.getElementById('manage-staff-button');
                const resetDatabaseButton = document.getElementById('reset-database-button');
                
                if (manageStaffButton) {
                    manageStaffButton.disabled = true;
                    manageStaffButton.style.opacity = '0.5';
                    manageStaffButton.style.cursor = 'not-allowed';
                    manageStaffButton.title = 'この操作には管理者権限が必要です';
                }
                if (resetDatabaseButton) {
                    resetDatabaseButton.disabled = true;
                    resetDatabaseButton.style.opacity = '0.5';
                    resetDatabaseButton.style.cursor = 'not-allowed';
                    resetDatabaseButton.title = 'この操作には管理者権限が必要です';
                }
            }

            toast.hide(authCheckToast);
            const dataLoadToast = toast.loading('データを読み込み中...');
            
            // Fetch data from Supabase
            [clients, staffs, appSettings, appLinks] = await Promise.all([
                fetchClientsOptimized(),
                fetchStaffs(),
                fetchSettings(),
                SupabaseAPI.getAppLinks()
            ]);

            applyFontFamily(appSettings.font_family);
            populateFilters();
            applyFilterState();
            renderClients();
            renderAppLinksButtons(); // Render the app link buttons
            updateSortIcons();
            
            toast.update(dataLoadToast, 'データ読み込み完了', 'success');

        } catch (error) {
            if (typeof dataLoadToast !== 'undefined') toast.hide(dataLoadToast);
            if (typeof authCheckToast !== 'undefined') toast.hide(authCheckToast);
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
                    status: client.status || 'active'
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
                
                // 'completed' フラグに基づいて完了月を特定
                const completedTasks = clientTasks.filter(task => task.completed === true);
                const completedMonths = completedTasks.map(task => task.month);

                let latestCompletedMonth = '-';
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
                    monthlyProgress: latestCompletedMonth, // 年月表示に戻す
                    unattendedMonths: unattendedMonths,
                    status: client.status || 'active'
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

        // Accordion (Management)
        accordionHeader.addEventListener('click', toggleAccordion);

        // Accordion (Other Apps)
        otherAppsAccordionHeader.addEventListener('click', () => {
            const isExpanded = otherAppsAccordionContent.style.display === 'block';
            otherAppsAccordionContent.style.display = isExpanded ? 'none' : 'block';
            
            const icon = otherAppsAccordionHeader.querySelector('.accordion-icon');
            if (icon) {
                icon.textContent = isExpanded ? '▼' : '▲';
            }

            // Add/remove global click listener for this accordion
            if (!isExpanded) { // If accordion is now expanded
                document.addEventListener('click', (e) => closeOtherAppsAccordionOnClickOutside(e, otherAppsAccordion, otherAppsAccordionContent, otherAppsAccordionHeader));
            } else { // If accordion is now collapsed
                document.removeEventListener('click', (e) => closeOtherAppsAccordionOnClickOutside(e, otherAppsAccordion, otherAppsAccordionContent, otherAppsAccordionHeader));
            }
        });

        // URL設定ボタンのイベントリスナー
        urlSettingsButton.addEventListener('click', openUrlSettingsModal);
        closeUrlSettingsModalButton.addEventListener('click', closeUrlSettingsModal);
        cancelUrlSettingsButton.addEventListener('click', closeUrlSettingsModal);
        addUrlButton.addEventListener('click', addNewUrlItem);
        saveUrlSettingsButton.addEventListener('click', saveUrlSettings);

        // Table header sorting
        clientsTableHeadRow.addEventListener('click', handleSort);

        // Client click handler
        clientsTableBody.addEventListener('click', handleClientClick);

        // Add client button
        document.getElementById('add-client-button').addEventListener('click', () => {
            // 新規作成画面でもスタッフデータをキャッシュ
            sessionStorage.setItem('cached_staffs_data', JSON.stringify(staffs));
            window.location.href = 'edit.html';
        });

        // Window click to close modal
        window.addEventListener('click', (e) => {
            if (e.target === staffEditModal) closeStaffModal();
            if (e.target === defaultTasksModal) closeDefaultTasksModal();
            if (e.target === basicSettingsModal) closeBasicSettingsModal();
            if (e.target === urlSettingsModal) closeUrlSettingsModal();
        });

        // CSV and DB Reset Buttons
        document.getElementById('export-csv-button').addEventListener('click', exportCSV);
        document.getElementById('import-csv-button').addEventListener('click', () => {
            document.getElementById('csv-file-input').click();
        });
        document.getElementById('csv-file-input').addEventListener('change', importCSV);
        document.getElementById('reset-database-button').addEventListener('click', resetDatabase);
        document.getElementById('reset-column-widths-button').addEventListener('click', resetColumnWidths);
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
            
            // 詳細画面でもクライアントデータをキャッシュ
            if (client) {
                sessionStorage.setItem('cached_client_data', JSON.stringify(client));
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

        // デスクトップ版テーブル表示
        clientsTableBody.innerHTML = '';

        if (sortedClients.length === 0) {
            const noDataRow = document.createElement('tr');
            noDataRow.innerHTML = '<td colspan="10" style="text-align: center; padding: 20px; color: #666;">該当するクライアントが見つかりません</td>';
            clientsTableBody.appendChild(noDataRow);
            
            // モバイル版も空メッセージ表示
            renderMobileCards([]);
            return;
        }

        sortedClients.forEach(client => {
            const row = createClientRow(client);
            clientsTableBody.appendChild(row);
        });

        // モバイル版カード表示
        renderMobileCards(sortedClients);
    }

    // モバイル用カード表示機能
    function renderMobileCards(clients) {
        const mobileContainer = document.getElementById('mobile-cards-container');
        if (!mobileContainer) return;

        mobileContainer.innerHTML = '';

        if (clients.length === 0) {
            mobileContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #666; font-size: 14px;">該当するクライアントが見つかりません</div>';
            return;
        }

        clients.forEach(client => {
            const card = createClientCard(client);
            mobileContainer.appendChild(card);
        });
    }

    // モバイル用クライアントカード作成
    function createClientCard(client) {
        const card = document.createElement('div');
        card.className = 'client-card';
        card.setAttribute('data-client-id', client.id);

        // Apply grayout effect for deleted clients
        if (client.status === 'deleted') {
            card.style.opacity = '0.5';
        }

        const fiscalMonth = client.fiscal_month ? `${client.fiscal_month}月` : '-';
        const staffName = client.staff_name || '-';
        const accountingMethod = client.accounting_method || '-';
        const updatedAt = client.updated_at ? 
            new Date(client.updated_at).toLocaleDateString('ja-JP') : '-';

        // 進捗データの計算
        const progressData = calculateProgress(client);
        const progressPercent = progressData.totalMonths > 0 ? 
            Math.round((progressData.completedMonths / progressData.totalMonths) * 100) : 0;

        // ステータス表示
        const statusClass = client.status === 'active' ? 'active' : 'inactive';
        const statusText = client.status === 'active' ? 'アクティブ' : '関与終了';

        card.innerHTML = `
            <div class="client-card-header">
                <h3 class="client-card-title">${client.name}</h3>
                <span class="client-card-id">ID: ${client.id}</span>
            </div>
            
            <div class="client-card-body">
                <div class="client-card-field">
                    <span class="client-card-label">決算月</span>
                    <span class="client-card-value">${fiscalMonth}</span>
                </div>
                <div class="client-card-field">
                    <span class="client-card-label">担当者</span>
                    <span class="client-card-value">${staffName}</span>
                </div>
                <div class="client-card-field">
                    <span class="client-card-label">経理方式</span>
                    <span class="client-card-value">${accountingMethod}</span>
                </div>
                <div class="client-card-field">
                    <span class="client-card-label">最終更新</span>
                    <span class="client-card-value">${updatedAt}</span>
                </div>
            </div>
            
            <div class="client-card-progress">
                <div class="client-card-label">月次進捗</div>
                <div class="client-card-progress-bar">
                    <div class="client-card-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="client-card-progress-text">${progressData.completedMonths}/${progressData.totalMonths} 完了 (${progressPercent}%)</div>
            </div>
            
            <div class="client-card-footer">
                <span class="client-card-status ${statusClass}">${statusText}</span>
                <button class="client-card-edit" onclick="navigateToDetails(${client.id})">詳細を見る</button>
            </div>
        `;

        return card;
    }

    // 進捗計算ヘルパー関数
    function calculateProgress(client) {
        // 月次進捗データから実際の完了率を計算
        const monthlyProgress = client.monthlyProgress || '0/12';
        const progressMatch = monthlyProgress.match(/(\d+)\/(\d+)/);
        
        if (progressMatch) {
            const completedMonths = parseInt(progressMatch[1], 10);
            const totalMonths = parseInt(progressMatch[2], 10);
            return {
                completedMonths: completedMonths,
                totalMonths: totalMonths
            };
        }
        
        // フォールバック
        return {
            completedMonths: 0,
            totalMonths: 12
        };
    }

    // 詳細画面への遷移
    function navigateToDetails(clientId) {
        window.location.href = `details.html?id=${clientId}`;
    }

    function createClientRow(client) {
        const row = document.createElement('tr');
        row.setAttribute('data-client-id', client.id);
        row.style.cursor = 'pointer';
        
        // Apply grayout effect for deleted clients
        if (client.status === 'deleted') {
            row.style.opacity = '0.5';
            row.style.textDecoration = 'line-through';
            row.style.backgroundColor = '#f8f9fa';
        } else {
            // Apply background color based on unattended months (only for active clients)
            const bgColor = getRowBackgroundColor(client.unattendedMonths);
            if (bgColor) {
                row.style.backgroundColor = bgColor;
            }
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
                    ${client.status === 'active' ? '稼働中' : '関与終了'}
                </span>
            </td>
            <td>
                <button class="edit-btn" onclick="window.editClient(${client.id}, event)" title="編集">
                    編集
                </button>
            </td>
        `;

        // Apply inactive styling if client is inactive or deleted
        if (client.status === 'inactive' || client.status === 'deleted') {
            row.classList.add('inactive-client');
        }

        return row;
    }

    function renderAppLinksButtons() {
        const container = otherAppsAccordionContent.querySelector('.accordion-buttons-container');
        if (!container) return;

        // Clear existing buttons except the settings button
        while (container.children.length > 1) {
            container.removeChild(container.lastChild);
        }

        // Add a separator if there are links
        if (appLinks.length > 0) {
            const separator = document.createElement('hr');
            separator.style.margin = '8px 0';
            container.appendChild(separator);
        }

        appLinks.forEach(link => {
            const button = document.createElement('button');
            button.className = 'accordion-button app-link-button'; // Apply new style
            button.textContent = link.name;
            button.addEventListener('click', () => {
                window.open(link.url, '_blank', 'noopener,noreferrer');
            });
            container.appendChild(button);
        });
    }

    // 編集画面に遷移（データキャッシュ付き）
    function editClient(clientId, event) {
        if (event) event.stopPropagation(); // Prevent row click
        
        // 編集画面で再利用できるようにデータをキャッシュ
        const clientData = clients.find(c => c.id == clientId);
        if (clientData) {
            sessionStorage.setItem('cached_client_data', JSON.stringify(clientData));
        }
        sessionStorage.setItem('cached_staffs_data', JSON.stringify(staffs));
        
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
        
        currentEditingStaffs.forEach((staff, index) => {
            const staffItem = document.createElement('div');
            staffItem.className = 'staff-item';
            staffItem.dataset.index = index;
            staffItem.dataset.staffId = staff.id || '';

            const clientCount = staff.id !== null ? (staffClientCounts[staff.id] || 0) : 0;
            const assignedClients = staff.id !== null ? (staffAssignedClients[staff.id] || []) : [];
            
            const clientInfo = clientCount > 0 ? 
                `<span class="client-count" title="担当クライアント: ${assignedClients.map(c => c.name).join(', ')}" style="color: #666; font-size: 0.9em; margin: 0 8px;">(${clientCount}件)</span>` : '';
            
            const deleteButtonDisabled = clientCount > 0 ? 'disabled title="担当クライアントがいるため削除できません"' : '';

            staffItem.innerHTML = `
                <input type="text" class="staff-name" value="${staff.name || ''}" placeholder="担当者名" style="flex: 1;">
                <input type="email" class="staff-email" value="${staff.email || ''}" placeholder="メールアドレス" style="flex: 1;">
                <select class="staff-role" style="flex: 0.7;">
                    <option value="staff" ${staff.role === 'staff' ? 'selected' : ''}>担当者</option>
                    <option value="admin" ${staff.role === 'admin' ? 'selected' : ''}>管理者</option>
                </select>
                ${clientInfo}
                <button type="button" class="delete-staff-button" ${deleteButtonDisabled}>削除</button>
            `;
            staffListContainer.appendChild(staffItem);
        });
    }

    // Remove old event listeners and add new ones
    // This is a simplified approach. For complex apps, a more robust event delegation is better.
    const newStaffListContainer = staffListContainer.cloneNode(true);
    staffListContainer.parentNode.replaceChild(newStaffListContainer, staffListContainer);
    staffListContainer = newStaffListContainer;

    staffListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-staff-button')) {
            const staffItem = e.target.closest('.staff-item');
            const index = parseInt(staffItem.dataset.index);
            currentEditingStaffs.splice(index, 1);
            renderStaffList(); // Re-render the list
        }
    });

    staffListContainer.addEventListener('input', (e) => {
        const target = e.target;
        const staffItem = target.closest('.staff-item');
        if (!staffItem) return;

        const index = parseInt(staffItem.dataset.index);
        if (isNaN(index)) return;

        if (target.classList.contains('staff-name')) {
            currentEditingStaffs[index].name = target.value;
        } else if (target.classList.contains('staff-email')) {
            currentEditingStaffs[index].email = target.value;
        } else if (target.classList.contains('staff-role')) {
            currentEditingStaffs[index].role = target.value;
        }
    });

    function addStaffInputField() {
        const newStaffNameInput = document.getElementById('new-staff-name');
        const newStaffEmailInput = document.getElementById('new-staff-email');
        const newStaffRoleSelect = document.getElementById('new-staff-role');

        const newStaffName = newStaffNameInput.value.trim();
        const newStaffEmail = newStaffEmailInput.value.trim();
        const newStaffRole = newStaffRoleSelect.value;

        if (newStaffName && newStaffEmail) {
            currentEditingStaffs.push({
                id: null,
                name: newStaffName,
                email: newStaffEmail,
                role: newStaffRole
            });
            renderStaffList();
            newStaffNameInput.value = '';
            newStaffEmailInput.value = '';
            newStaffRoleSelect.value = 'staff';
        } else {
            alert('担当者名とメールアドレスは必須です。');
        }
    }

    async function saveStaffs() {
        try {
            // --- Data Validation ---
            for (const staff of currentEditingStaffs) {
                if (!staff.name || !staff.email) {
                    alert('すべての担当者名とメールアドレスを入力してください。');
                    return;
                }
                // Basic email format check
                if (!/\S+@\S+\.\S+/.test(staff.email)) {
                    alert(`無効なメールアドレス形式です: ${staff.email}`);
                    return;
                }
            }

            // --- Determine Operations ---
            const toCreate = currentEditingStaffs.filter(c => c.id === null);
            const toUpdate = currentEditingStaffs.filter(c => {
                if (c.id === null) return false;
                const original = originalStaffsState.find(o => o.id === c.id);
                return original && (original.name !== c.name || original.email !== c.email || original.role !== c.role);
            });
            const toDelete = originalStaffsState.filter(o => !currentEditingStaffs.some(c => c.id === o.id));

            console.log('Staff operations:', { toDelete, toUpdate, toCreate });

            // --- Execute DB Operations ---
            const operations = [];

            if (toDelete.length > 0) {
                operations.push(SupabaseAPI.deleteStaffs(toDelete.map(s => s.id)));
            }
            if (toUpdate.length > 0) {
                const updates = toUpdate.map(s => ({ id: s.id, name: s.name, email: s.email, role: s.role }));
                operations.push(SupabaseAPI.updateStaffs(updates));
            }
            if (toCreate.length > 0) {
                const creates = toCreate.map(s => ({ name: s.name, email: s.email, role: s.role }));
                operations.push(SupabaseAPI.createStaffs(creates));
            }

            await Promise.all(operations);

            // --- Post-Save Refresh ---
            staffs = await fetchStaffs();
            populateFilters();
            renderClients(); //担当者名が変わった可能性があるのでクライアントリストも更新
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
        // Clear new staff input fields
        const newStaffNameInput = document.getElementById('new-staff-name');
        const newStaffEmailInput = document.getElementById('new-staff-email');
        const newStaffRoleSelect = document.getElementById('new-staff-role');
        if(newStaffNameInput) newStaffNameInput.value = '';
        if(newStaffEmailInput) newStaffEmailInput.value = '';
        if(newStaffRoleSelect) newStaffRoleSelect.value = 'staff';
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
            const matchesStatus = client.status === 'active' || (showInactive && (client.status === 'inactive' || client.status === 'deleted'));
            

            return matchesSearch && matchesStaff && matchesMonth && matchesStatus;
        });
    }

    function sortClients(clientList) {
        // 決算月ソートの場合のみカスタムロジックを適用
        if (currentSortKey === 'fiscal_month') {
            const currentMonth = new Date().getMonth() + 1; // 0-11 -> 1-12
            const sortStartMonth = (currentMonth - 2 + 12) % 12 || 12; // 現在の月-2か月を起点 (1-12)

            return clientList.sort((a, b) => {
                let aMonth = a.fiscal_month;
                let bMonth = b.fiscal_month;

                // null や undefined の場合はソートの最後に持ってくる
                if (aMonth === null || aMonth === undefined) return 1;
                if (bMonth === null || bMonth === undefined) return -1;

                // 起点からの距離を計算
                let aDistance = (aMonth - sortStartMonth + 12) % 12;
                let bDistance = (bMonth - sortStartMonth + 12) % 12;

                // 決算月が同じ場合は未入力期間でソート
                if (aDistance === bDistance) {
                    let aUnattended = a.unattendedMonths;
                    let bUnattended = b.unattendedMonths;

                    // 未入力期間が '-' の場合は数値として扱わない
                    if (aUnattended === '-') aUnattended = -Infinity; // 長いとみなす
                    if (bUnattended === '-') bUnattended = -Infinity; // 長いとみなす

                    // 未入力期間が長い方が上に来るように降順ソート
                    if (aUnattended === bUnattended) return 0;
                    return bUnattended - aUnattended; // 降順
                }

                const result = aDistance < bDistance ? -1 : 1;
                return currentSortDirection === 'asc' ? result : -result;
            });
        } else {
            // その他のキーでのソートは既存ロジックを維持
            return clientList.sort((a, b) => {
                let aValue = a[currentSortKey];
                let bValue = b[currentSortKey];

                // 「-」の値を常に最後に配置する特別ルール
                const isADash = aValue === '-' || aValue === null || aValue === undefined;
                const isBDash = bValue === '-' || bValue === null || bValue === undefined;
                if (isADash && isBDash) return 0;
                if (isADash) return 1; // aが「-」ならaをbの後ろに
                if (isBDash) return -1; // bが「-」ならbをaの後ろに

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
    }

    // --- Setup Functions ---
    function setupTableHeaders() {
        if (!clientsTableHeadRow) return;

        const headers = clientsTableHeadRow.querySelectorAll('th');
        headers.forEach((header, index) => {
            // 既にアイコンが追加されている場合は何もしない
            if (header.querySelector('.sort-icon')) {
                return;
            }

            const headerText = header.textContent.trim();
            const sortKey = headerMap[headerText];
            
            if (sortKey) {
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
            const exportToast = toast.loading('CSVエクスポート中...');
            
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
            
            toast.update(exportToast, 'CSVエクスポート完了', 'success');
            setTimeout(hideStatus, 2000);
        } catch (error) {
            console.error('CSV export error:', error);
            toast.error(`エクスポートエラー: ${handleSupabaseError(error)}`);
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
            const importToast = toast.loading('CSVインポート中...');
            
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
                toast.update(importToast, result.message, 'success');
                
                // データを再読み込み
                clients = await fetchClientsOptimized();
                renderClients();
                populateFilters();
                
                alert(`インポートが完了しました。\n${result.message}`);
            }
        } catch (error) {
            console.error('CSV import error:', error);
            toast.hide(importToast);
            toast.error(`インポートエラー: ${handleSupabaseError(error)}`);
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
            const resetToast = toast.loading('データベースを初期化中... この処理には時間がかかります');
            
            const result = await SupabaseAPI.resetDatabase();
            
            if (result.success) {
                toast.update(resetToast, 'データベース初期化完了', 'success');
                
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
            toast.hide(resetToast);
            toast.error(`初期化エラー: ${handleSupabaseError(error)}`);
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

        // Add/remove global click listener
        if (!isExpanded) { // If accordion is now expanded
            document.addEventListener('click', closeAccordionOnClickOutside);
        } else { // If accordion is now collapsed
            document.removeEventListener('click', closeAccordionOnClickOutside);
        }
    }

    function closeAccordionOnClickOutside(event) {
        // Check if the clicked element is inside the accordion header or content
        if (!accordionHeader.contains(event.target) && !accordionContent.contains(event.target)) {
            // If not, close the accordion
            accordionContent.style.display = 'none';
            const icon = accordionHeader.querySelector('.accordion-icon');
            if (icon) {
                icon.textContent = '▼'; // Reset icon to closed state
            }
            document.removeEventListener('click', closeAccordionOnClickOutside); // Remove listener
        }
    }

    function closeOtherAppsAccordionOnClickOutside(event, accordionContainer, accordionContent, accordionHeader) {
        // Check if the clicked element is inside the accordion header or content
        if (!accordionContainer.contains(event.target)) {
            // If not, close the accordion
            accordionContent.style.display = 'none';
            const icon = accordionHeader.querySelector('.accordion-icon');
            if (icon) {
                icon.textContent = '▼'; // Reset icon to closed state
            }
            document.removeEventListener('click', (e) => closeOtherAppsAccordionOnClickOutside(e, accordionContainer, accordionContent, accordionHeader)); // Remove listener
        }
    }

    // --- URL Settings Modal Functions ---
    function openUrlSettingsModal() {
        originalAppLinksState = JSON.parse(JSON.stringify(appLinks));
        currentEditingAppLinks = JSON.parse(JSON.stringify(appLinks));
        renderUrlListForEdit();
        urlSettingsModal.style.display = 'block';
    }

    function closeUrlSettingsModal() {
        if (sortableUrlList) {
            sortableUrlList.destroy();
            sortableUrlList = null;
        }
        urlSettingsModal.style.display = 'none';
    }

    function renderUrlListForEdit() {
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
        const name = newUrlNameInput.value.trim();
        const url = newUrlLinkInput.value.trim();

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
        newUrlNameInput.value = '';
        newUrlLinkInput.value = '';
    }

    async function saveUrlSettings() {
        const saveToast = toast.loading('URL設定を保存中...');
        
        // Get the final order from the DOM
        const orderedIds = Array.from(urlListContainer.children).map(item => item.dataset.id);
        const finalLinks = [];
        const inputs = Array.from(urlListContainer.querySelectorAll('.url-item'));

        for (const id of orderedIds) {
            const itemElement = inputs.find(el => el.dataset.id === id);
            if (itemElement) {
                const name = itemElement.querySelector('.url-name-input').value.trim();
                const url = itemElement.querySelector('.url-link-input').value.trim();

                if (!name || !url) {
                    toast.update(saveToast, 'リンク名とURLは必須です。', 'error');
                    return;
                }

                const originalLink = currentEditingAppLinks.find(l => (l.id || `new-${currentEditingAppLinks.indexOf(l)}`) == id);
                const linkData = {
                    name,
                    url,
                    display_order: finalLinks.length
                };
                if (!id.startsWith('new-')) {
                    linkData.id = parseInt(id);
                }
                finalLinks.push(linkData);
            }
        }

        const originalIds = new Set(originalAppLinksState.map(l => l.id));
        const finalIds = new Set(finalLinks.filter(l => l.id).map(l => l.id));
        const idsToDelete = [...originalIds].filter(id => !finalIds.has(id));

        const linksToCreate = finalLinks.filter(l => l.id === undefined);
        const linksToUpdate = finalLinks.filter(l => l.id !== undefined);

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

            appLinks = await SupabaseAPI.getAppLinks();
            renderAppLinksButtons();
            closeUrlSettingsModal();
            toast.update(saveToast, 'URL設定を保存しました', 'success');
        } catch (error) {
            console.error('Error saving URL settings:', error);
            toast.update(saveToast, `保存エラー: ${handleSupabaseError(error)}`, 'error');
        }
    }

    // Initialize the application
    initializeApp();
});