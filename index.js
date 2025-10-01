import { SupabaseAPI, handleSupabaseError, supabase } from './supabase-client.js';

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
    // 削除されたアコーディオンメニューのボタンはコメントアウト
    // const openDefaultTasksModalButton = document.getElementById('default-tasks-settings-button');
    const closeDefaultTasksModalButton = defaultTasksModal.querySelector('.close-button');
    const saveDefaultTasksButton = document.getElementById('save-default-tasks-button');
    const cancelDefaultTasksButton = document.getElementById('cancel-default-tasks-button');
    const tasksKityoContainer = document.getElementById('tasks-kityo');
    const tasksJikeiContainer = document.getElementById('tasks-jikei');

    // URL Settings Button (moved to management accordion)
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
    const enableConfettiEffectCheckbox = document.getElementById('enable-confetti-effect');

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
    let userRole = null; // ユーザーの権限（'admin' or 'staff' or null）
    let defaultTasks = {}; // State for default tasks
    let appSettings = {}; // State for application settings
    let filterState = {}; // フィルター状態を保存
    let appLinks = []; // State for app links
    let originalAppLinksState = [];
    let currentEditingAppLinks = [];
    let sortableUrlList = null;
    let isInitialized = false; // アプリの初期化状態を追跡するフラグ

    // --- Local Storage Helper Functions ---
    function getConfettiEffectSetting() {
        const personalSettings = loadPersonalSettings();
        return personalSettings.enableConfettiEffect;
    }

    function setConfettiEffectSetting(enabled) {
        const personalSettings = loadPersonalSettings();
        personalSettings.enableConfettiEffect = enabled;
        savePersonalSettings(personalSettings);
    }

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
    // Removed resetColumnWidths function as it's no longer needed

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

            const { data, error } = await SupabaseAPI.signInWithGoogle();

            if (error) {
                console.error('Sign in error:', error);
                showAuthStatus('❌ ログインエラー: ' + error.message, 'error');
                return false;
            } else {
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
            isInitialized = false; // ログアウト時に初期化フラグをリセット
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
            const displayName = user.user_metadata?.full_name || user.email.split('@')[0];
            const displayEmail = user.email;
            
            // 従来のユーザー表示エリア（非表示）
            userName.textContent = displayName;
            userEmail.textContent = displayEmail;
            
            // 管理メニュー内のユーザー表示
            const userNameMenu = document.getElementById('user-name-menu');
            const userEmailMenu = document.getElementById('user-email-menu');
            const userAvatarMenu = document.getElementById('user-avatar-menu');
            
            if (userNameMenu) userNameMenu.textContent = displayName;
            if (userEmailMenu) userEmailMenu.textContent = displayEmail;
            
            if (user.user_metadata?.avatar_url) {
                userAvatar.src = user.user_metadata.avatar_url;
                userAvatar.style.display = 'block';
                
                if (userAvatarMenu) {
                    userAvatarMenu.src = user.user_metadata.avatar_url;
                    userAvatarMenu.style.display = 'block';
                }
            }
            
            // userInfo は非表示のまま（管理メニューに統合済み）
            authModal.style.display = 'none';
        } else {
            userInfo.style.display = 'none';
            authModal.style.display = 'flex';
            
            // 管理メニュー内のユーザー表示もクリア
            const userNameMenu = document.getElementById('user-name-menu');
            const userEmailMenu = document.getElementById('user-email-menu');
            if (userNameMenu) userNameMenu.textContent = '';
            if (userEmailMenu) userEmailMenu.textContent = '';
        }
    }

    async function checkAuthState() {
        try {
            const user = await SupabaseAPI.getCurrentUserWithRouting();

            if (user) {
                updateUserDisplay(user);
                return true;
            } else {
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
        
        // 管理メニュー内のログアウトボタン
        const signOutButtonMenu = document.getElementById('signout-button-menu');
        if (signOutButtonMenu) {
            signOutButtonMenu.addEventListener('click', signOut);
        }

        // Listen for auth state changes
        if (SupabaseAPI.supabase && SupabaseAPI.supabase.auth) {
            SupabaseAPI.supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN' && session?.user) {
                    updateUserDisplay(session.user);
                    // Initialize app when user signs in
                    await initializeAuthenticatedApp();
                } else if (event === 'SIGNED_OUT') {
                    updateUserDisplay(null);
                    isInitialized = false; // ログアウト時に初期化フラグをリセット
                }
            });
        }
    }

    // --- Initial Setup ---
    async function initializeApp() {
        // Add auth event listeners first
        addAuthEventListeners();
        
        // Check authentication state
        const isAuthenticated = await checkAuthState();
        
        // Only initialize app if authenticated
        if (!isAuthenticated) {
            authModal.style.display = 'flex';
            hideStatus();
            return;
        }
        
        await initializeAuthenticatedApp();
    }

    // Initialize app when authenticated
    async function initializeAuthenticatedApp() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        try {
            const authCheckToast = toast.loading('ユーザー権限を確認中...');

            userRole = await SupabaseAPI.getUserRole();

            // Check if user is registered in the staffs table
            if (userRole === null) {
                console.warn('Unauthorized user. Showing access denied modal.');
                toast.hide(authCheckToast);

                // Blur the background and show the custom access denied modal
                const mainContainer = document.querySelector('.container');
                if (mainContainer) mainContainer.classList.add('blur-background');
                
                const accessDeniedModal = document.getElementById('access-denied-modal');
                if (accessDeniedModal) accessDeniedModal.style.display = 'flex';

                const okButton = document.getElementById('access-denied-ok-button');
                if (okButton) {
                    okButton.onclick = async () => {
                        okButton.disabled = true;
                        okButton.textContent = 'アカウント選択へ移動...';
                        await SupabaseAPI.signOut();
                        // アカウント選択を強制して再ログイン
                        await SupabaseAPI.signInWithGoogle({ 
                            queryParams: { 
                                prompt: 'select_account' 
                            } 
                        });
                    };
                }

                return; // Stop further execution
            }

            // If user is registered, proceed with setup and UI customization
            setupTableHeaders();
            updateSortIcons(); // ソートアイコンの初期表示
            addEventListeners();
            populateMonthThresholds();
            populateFontFamilySelect();
            loadFilterState();

            // Disable admin buttons if user is not an admin
            if (userRole !== 'admin') {
                const manageStaffButton = document.getElementById('manage-staff-button');
                // resetDatabaseButton は基本設定モーダル内に移動済み
                
                if (manageStaffButton) {
                    manageStaffButton.disabled = true;
                    manageStaffButton.style.opacity = '0.5';
                    manageStaffButton.style.cursor = 'not-allowed';
                    manageStaffButton.title = 'この操作には管理者権限が必要です';
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

            // Apply settings
            const personalSettings = loadPersonalSettings();
            applyPersonalSettings(personalSettings);
            applyFontFamily(appSettings.font_family); // 共通設定のフォントは廃止予定、個別設定を優先
            
            populateFilters();
            applyFilterState();
            renderClients();
            renderAppLinksButtons(); // Render the app link buttons
            updateSortIcons();
            
            toast.update(dataLoadToast, 'データ読み込み完了', 'success');

            // 管理者の場合、初回アクセス時にバックアップレポートを表示
            if (userRole === 'admin') {
                setTimeout(async () => {
                    try {
                        await SupabaseAPI.showLatestAdminReport();
                    } catch (error) {
                        console.error('管理者レポート表示エラー:', error);
                    }
                }, 1000); // データ読み込み完了後1秒待って表示
            }

        } catch (error) {
            if (typeof dataLoadToast !== 'undefined') toast.hide(dataLoadToast);
            if (typeof authCheckToast !== 'undefined') toast.hide(authCheckToast);
            console.error("Error initializing app:", error);
            alert("アプリケーションの初期化に失敗しました: " + handleSupabaseError(error));
            isInitialized = false; // エラー発生時にフラグをリセットして再試行を許可
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
        
        // Clear filters button
        const clearFiltersButton = document.getElementById('clear-filters-button');
        if (clearFiltersButton) {
            clearFiltersButton.addEventListener('click', clearAllFilters);
        }

        // Staff modal - with debugging
        const manageStaffBtn = document.getElementById('manage-staff-button');
        if (manageStaffBtn) {
            manageStaffBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openStaffEditModal();
            });
        } else {
            console.error('manage-staff-button not found in DOM');
        }

        // 担当者選択ボタン
        const selectUserBtn = document.getElementById('select-user-button');
        if (selectUserBtn) {
            selectUserBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // sessionStorageをクリアして担当者選択画面へ
                sessionStorage.removeItem('selected-staff-id');
                sessionStorage.removeItem('selected-staff-name');
                sessionStorage.removeItem('selected-staff-email');
                window.location.href = '/select-user.html';
            });
        }
        
        if (closeStaffModalButton) {
            closeStaffModalButton.addEventListener('click', closeStaffModal);
        }
        if (addStaffButton) {
            addStaffButton.addEventListener('click', addStaffInputField);
        }
        if (saveStaffButton) {
            saveStaffButton.addEventListener('click', saveStaffs);
        }
        if (cancelStaffButton) {
            cancelStaffButton.addEventListener('click', closeStaffModal);
        }
        
        // CSV export button
        const exportStaffCsvButton = document.getElementById('export-staff-csv-button');
        if (exportStaffCsvButton) {
            exportStaffCsvButton.addEventListener('click', exportStaffToCSV);
        }

        // Default Tasks modal
        // openDefaultTasksModalButton.addEventListener('click', openDefaultTasksModal); // 削除されたボタン
        closeDefaultTasksModalButton.addEventListener('click', closeDefaultTasksModal);
        saveDefaultTasksButton.addEventListener('click', saveDefaultTasks);
        cancelDefaultTasksButton.addEventListener('click', closeDefaultTasksModal);

        // Basic Settings modal
        openBasicSettingsModalButton.addEventListener('click', openBasicSettingsModal);
        closeBasicSettingsModalButton.addEventListener('click', closeBasicSettingsModal);
        saveBasicSettingsButton.addEventListener('click', saveBasicSettings);
        cancelBasicSettingsButton.addEventListener('click', closeBasicSettingsModal);

        // Analytics button
        const analyticsButton = document.getElementById('analytics-button');
        if (analyticsButton) {
            analyticsButton.addEventListener('click', () => {
                window.location.href = 'analytics.html';
            });
        }

        // Accordion (Management)
        accordionHeader.addEventListener('click', toggleAccordion);

        // Other Apps Accordion removed - functionality moved to analytics.html

        // URL設定ボタンのイベントリスナー - with debugging
        if (urlSettingsButton) {
            urlSettingsButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openUrlSettingsModal();
            });
        } else {
            // URL設定ボタンはanalytics.htmlに移動済みのため、index.htmlでは不要
            console.log('url-settings-button not found (expected on index.html - URL settings moved to analytics.html)');
        }
        
        if (closeUrlSettingsModalButton) {
            closeUrlSettingsModalButton.addEventListener('click', closeUrlSettingsModal);
        }
        if (cancelUrlSettingsButton) {
            cancelUrlSettingsButton.addEventListener('click', closeUrlSettingsModal);
        }
        if (addUrlButton) {
            addUrlButton.addEventListener('click', addNewUrlItem);
        }
        if (saveUrlSettingsButton) {
            saveUrlSettingsButton.addEventListener('click', saveUrlSettings);
        }

        // Table header sorting
        if (clientsTableHeadRow) {
            clientsTableHeadRow.addEventListener('click', handleSort);
        } else {
            console.error('clientsTableHeadRow not found!');
        }

        // Client click handler
        clientsTableBody.addEventListener('click', handleClientClick);

        // Add client button - with debugging
        const addClientBtn = document.getElementById('add-client-button');
        if (addClientBtn) {
            addClientBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 新規作成画面でもスタッフデータをキャッシュ
                sessionStorage.setItem('cached_staffs_data', JSON.stringify(staffs));
                window.location.href = 'edit.html';
            });
        } else {
            console.error('add-client-button not found in DOM');
        }

        // Window click to close modal
        window.addEventListener('click', (e) => {
            if (e.target === staffEditModal) closeStaffModal();
            if (e.target === defaultTasksModal) closeDefaultTasksModal();
            if (e.target === basicSettingsModal) closeBasicSettingsModal();
            if (e.target === urlSettingsModal) closeUrlSettingsModal();
        });

        // Font size control event listeners
        const fontSizeDecrease = document.getElementById('font-size-decrease');
        const fontSizeIncrease = document.getElementById('font-size-increase');
        const fontSizeReset = document.getElementById('font-size-reset');
        const fontSizeDisplay = document.getElementById('font-size-display');

        if (fontSizeDecrease && fontSizeIncrease && fontSizeReset && fontSizeDisplay) {
            fontSizeDecrease.addEventListener('click', () => adjustFontSize(-5));
            fontSizeIncrease.addEventListener('click', () => adjustFontSize(5));
            fontSizeReset.addEventListener('click', () => resetFontSize());
        }

        // CSV file input (共通で使用)
        document.getElementById('csv-file-input').addEventListener('change', importCSV);

        // 基本設定モーダル内のボタン
        document.getElementById('export-csv-button-modal').addEventListener('click', exportCSV);
        document.getElementById('import-csv-button-modal').addEventListener('click', () => {
            document.getElementById('csv-file-input').click();
        });
        document.getElementById('reset-database-button-modal').addEventListener('click', openDatabaseResetModal);
        document.getElementById('default-tasks-settings-button-modal').addEventListener('click', () => {
            closeBasicSettingsModal();
            openDefaultTasksModal();
        });

        // 管理者レポートボタンを追加（管理者権限の場合のみ）
        addAdminReportButton();

        // データベース初期化モーダルのイベントリスナー
        const appNameInput = document.getElementById('app-name-input');
        const confirmResetButton = document.getElementById('confirm-reset-button');
        const cancelResetButton = document.getElementById('cancel-reset-button');

        if (appNameInput) {
            appNameInput.addEventListener('input', validateAppName);
            appNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !confirmResetButton.disabled) {
                    resetDatabase();
                }
            });
        }

        if (confirmResetButton) {
            confirmResetButton.addEventListener('click', resetDatabase);
        }

        if (cancelResetButton) {
            cancelResetButton.addEventListener('click', closeDatabaseResetModal);
        }

        // モーダル外クリックで閉じる
        const databaseResetModal = document.getElementById('database-reset-modal');
        if (databaseResetModal) {
            databaseResetModal.addEventListener('click', (e) => {
                if (e.target === databaseResetModal) {
                    closeDatabaseResetModal();
                }
            });
        }
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

        // ソート機能をテーブル描画後に再設定（renderClients内部からの呼び出しは避ける）
        if (!window.isRenderingClients) {
            setupTableHeaders();
            updateSortIcons();
        }

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
            new Date(client.updated_at).toLocaleString('ja-JP', { 
                timeZone: 'Asia/Tokyo',
                month: 'numeric', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            }) : '-';

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
                <button class="client-card-edit" data-client-id="${client.id}">詳細を見る</button>
            </div>
        `;

        // ボタンにイベントリスナーを追加
        const editButton = card.querySelector('.client-card-edit');
        editButton.addEventListener('click', () => {
            window.location.href = `details.html?id=${client.id}`;
        });

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
            new Date(client.updated_at).toLocaleString('ja-JP', { 
                timeZone: 'Asia/Tokyo',
                month: 'numeric', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            }) : '-';

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
        // Other Apps functionality moved to analytics.html
        return;
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
            
            if (staffEditModal) {
                staffEditModal.style.display = 'block';
            } else {
                console.error('staffEditModal element not found!');
            }
        } catch (error) {
            console.error('Error opening staff modal:', error);
            alert('担当者データの表示に失敗しました: ' + error.message);
        }
    }

    function renderStaffList() {
        staffListContainer.innerHTML = '';
        
        // スタッフ数カウンターを更新
        const staffCountDisplay = document.getElementById('staff-count-display');
        if (staffCountDisplay) {
            staffCountDisplay.textContent = `${currentEditingStaffs.length}名`;
        }
        
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
        
        if (currentEditingStaffs.length === 0) {
            // 空の状態のプレースホルダーを表示
            staffListContainer.innerHTML = `
                <div class="empty-staff-placeholder">
                    <div class="placeholder-icon">👤</div>
                    <p>まだ担当者が登録されていません</p>
                    <p>下のフォームから新しい担当者を追加してください</p>
                </div>
            `;
            return;
        }
        
        currentEditingStaffs.forEach((staff, index) => {
            const staffItem = document.createElement('div');
            staffItem.className = 'modern-staff-item';
            staffItem.dataset.index = index;
            staffItem.dataset.staffId = staff.id || '';

            const clientCount = staff.id !== null ? (staffClientCounts[staff.id] || 0) : 0;
            const assignedClients = staff.id !== null ? (staffAssignedClients[staff.id] || []) : [];
            
            // アバターのイニシャル生成
            const getInitials = (name) => {
                if (!name) return '?';
                return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || name[0].toUpperCase();
            };
            
            const roleIcon = staff.role === 'admin' ? '🔐' : '👤';
            const roleText = staff.role === 'admin' ? '管理者' : '担当者';
            
            const deleteButtonDisabled = clientCount > 0;
            const tooltipText = clientCount > 0 ? 
                `担当クライアント: ${assignedClients.map(c => c.name).join(', ')}` : 
                '削除可能です';

            staffItem.innerHTML = `
                <div class="staff-id-badge">
                    <span style="opacity: 0.8;">#</span>${staff.id || 'NEW'}
                </div>
                <div class="staff-avatar">${getInitials(staff.name)}</div>
                <div class="staff-info">
                    <input type="text" class="staff-name-input staff-name" value="${staff.name || ''}" placeholder="担当者名を入力">
                    <input type="email" class="staff-email-input staff-email" value="${staff.email || ''}" placeholder="メールアドレスを入力">
                    <select class="staff-role-select staff-role">
                        <option value="staff" ${staff.role === 'staff' ? 'selected' : ''}>${roleIcon} 担当者</option>
                        <option value="admin" ${staff.role === 'admin' ? 'selected' : ''}>🔐 管理者</option>
                    </select>
                </div>
                <div class="staff-meta">
                    ${clientCount > 0 ? `<div class="staff-clients-badge">${clientCount}件担当</div>` : ''}
                    <div class="staff-tooltip" data-tooltip="${tooltipText}">
                        <button type="button" class="modern-delete-staff-button delete-staff-button" ${deleteButtonDisabled ? 'disabled' : ''}>
                            <span class="button-icon">🗑️</span>
                            削除
                        </button>
                    </div>
                </div>
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
        // 削除ボタンまたはその子要素がクリックされた場合
        const deleteButton = e.target.closest('.delete-staff-button');
        if (deleteButton && !deleteButton.disabled) {
            const staffItem = deleteButton.closest('.modern-staff-item');
            if (!staffItem) return; // nullチェックを追加
            const index = parseInt(staffItem.dataset.index);
            
            // 担当クライアントがいる場合は削除できない
            const staff = currentEditingStaffs[index];
            const assignedClients = clients.filter(client => client.staff_id === staff.id);
            
            if (assignedClients.length > 0) {
                alert(`${staff.name}さんは${assignedClients.length}件のクライアントを担当しているため削除できません。\n先にクライアントの担当者を変更してから削除してください。\n\n担当クライアント: ${assignedClients.map(c => c.name).join(', ')}`);
                return;
            }
            
            // 削除確認
            if (confirm(`${staff.name}さんを削除しますか？`)) {
                currentEditingStaffs.splice(index, 1);
                renderStaffList(); // Re-render the list
            }
        }
    });

    staffListContainer.addEventListener('input', (e) => {
        const target = e.target;
        const staffItem = target.closest('.modern-staff-item');
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

    // CSV抽出機能
    async function exportStaffToCSV() {
        try {
            const exportToast = toast.loading('担当者データをCSV形式で抽出中...');
            
            // 担当クライアント数を計算
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
            
            // CSVヘッダー
            const headers = [
                'ID',
                '担当者名',
                'メール',
                '権限', 
                '担当クライアント数',
                '担当クライアント名一覧',
                '作成日時',
                '更新日時'
            ];
            
            // CSVデータ作成
            const csvData = staffs.map(staff => {
                const clientCount = staffClientCounts[staff.id] || 0;
                const assignedClients = staffAssignedClients[staff.id] || [];
                const clientNames = assignedClients.map(client => client.name).join('；');
                
                // 権限の日本語変換
                const roleText = staff.role === 'admin' ? '管理者' : 
                                staff.role === 'staff' ? '担当者' : 
                                staff.role || '';
                
                return [
                    staff.id,
                    staff.name,
                    staff.email || '',
                    roleText,
                    clientCount,
                    clientNames,
                    staff.created_at ? new Date(staff.created_at).toLocaleString('ja-JP') : '',
                    staff.updated_at ? new Date(staff.updated_at).toLocaleString('ja-JP') : ''
                ];
            });
            
            // CSVコンテンツ生成
            const csvContent = [headers, ...csvData]
                .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
                .join('\n');
            
            // BOM付きUTF-8でBlob作成（Excel対応）
            const bom = '\uFEFF';
            const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // ダウンロード実行
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const filename = `担当者一覧_${timestamp}.csv`;
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            toast.update(exportToast, `CSV抽出完了: ${filename}`, 'success');
            
        } catch (error) {
            console.error('Staff CSV export error:', error);
            toast.error('CSV抽出に失敗しました: ' + error.message);
        }
    }

    // --- Settings Management ---
    async function openBasicSettingsModal() {
        try {
            appSettings = await fetchSettings();
            const personalSettings = loadPersonalSettings();
            
            // 共通設定（Supabaseから取得）
            yellowThresholdSelect.value = appSettings.yellow_threshold;
            redThresholdSelect.value = appSettings.red_threshold;
            yellowColorInput.value = appSettings.yellow_color;
            redColorInput.value = appSettings.red_color;
            
            // 個別設定（ローカルストレージから取得）
            fontFamilySelect.value = personalSettings.fontFamily;
            hideInactiveClientsCheckbox.checked = personalSettings.hideInactiveClients;
            enableConfettiEffectCheckbox.checked = personalSettings.enableConfettiEffect;
            
            // 管理者権限チェックと管理者設定の制御
            checkAndSetAdminPermissions();
            
            basicSettingsModal.style.display = 'block';
        } catch (error) {
            console.error('Error opening basic settings modal:', error);
            alert('設定の取得に失敗しました: ' + handleSupabaseError(error));
        }
    }

    async function saveBasicSettings() {
        try {
            // 共通設定（Supabaseに保存）
            const commonSettings = {
                yellow_threshold: parseInt(yellowThresholdSelect.value),
                red_threshold: parseInt(redThresholdSelect.value),
                yellow_color: yellowColorInput.value,
                red_color: redColorInput.value
            };

            // 個別設定（ローカルストレージに保存）
            const personalSettings = {
                fontFamily: fontFamilySelect.value,
                hideInactiveClients: hideInactiveClientsCheckbox.checked,
                enableConfettiEffect: enableConfettiEffectCheckbox.checked
            };

            // 共通設定をSupabaseに保存
            await Promise.all([
                SupabaseAPI.setSetting('yellow_threshold', commonSettings.yellow_threshold),
                SupabaseAPI.setSetting('red_threshold', commonSettings.red_threshold),
                SupabaseAPI.setSetting('yellow_color', commonSettings.yellow_color),
                SupabaseAPI.setSetting('red_color', commonSettings.red_color)
            ]);
            
            // 個別設定をローカルストレージに保存
            savePersonalSettings(personalSettings);
            // 紙吹雪エフェクト設定は personalSettings に含まれるため、重複削除

            appSettings = {...appSettings, ...commonSettings};
            applyPersonalSettings(personalSettings);
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

    // 管理者権限チェックと管理者設定エリアの制御
    function checkAndSetAdminPermissions() {
        const adminSettingsColumn = document.querySelector('.admin-settings');
        const adminButtons = document.querySelectorAll('.admin-only');
        
        if (userRole !== 'admin') {
            // 管理者でない場合、管理者設定エリアを無効化
            adminSettingsColumn.classList.add('non-admin');
            adminButtons.forEach(button => {
                button.disabled = true;
                button.title = '管理者権限が必要です';
            });
        } else {
            // 管理者の場合、管理者設定エリアを有効化
            adminSettingsColumn.classList.remove('non-admin');
            adminButtons.forEach(button => {
                button.disabled = false;
                button.title = '';
            });
        }
    }

    // --- 個別設定のローカルストレージ管理 ---
    function loadPersonalSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('personalSettings') || '{}');

        // デフォルト値
        const defaults = {
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            hideInactiveClients: false,
            enableConfettiEffect: false
        };
        
        // 既存の古い設定を移行（一度だけ）
        if (savedSettings.enableConfettiEffect === undefined && localStorage.getItem('enableConfettiEffect') !== null) {
            savedSettings.enableConfettiEffect = localStorage.getItem('enableConfettiEffect') === 'true';
        }
        
        const mergedSettings = { ...defaults, ...savedSettings };
        return mergedSettings;
    }

    function savePersonalSettings(settings) {
        localStorage.setItem('personalSettings', JSON.stringify(settings));
    }

    function applyPersonalSettings(settings) {
        // フォントの適用
        if (settings.fontFamily) {
            document.body.style.fontFamily = settings.fontFamily;
        }
        
        // 関与終了顧問先の表示制御
        if (settings.hideInactiveClients) {
            document.body.classList.add('hide-inactive-clients');
        } else {
            document.body.classList.remove('hide-inactive-clients');
        }
        
        // 紙吹雪エフェクト設定は個別の関数で管理（既存機能を維持）
        // この設定も実際にはローカルストレージに保存される
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

    function clearAllFilters() {
        // Clear search input
        searchInput.value = '';
        
        // Reset staff filter to default
        staffFilter.value = '';
        
        // Reset month filter to default
        monthFilter.value = '';
        
        // Update custom dropdown displays and reset their state
        updateCustomDropdownTriggers();
        
        // Clear selected state from custom dropdown options
        document.querySelectorAll('.custom-options .selected').forEach(option => {
            option.classList.remove('selected');
        });
        
        // Re-render clients with cleared filters
        renderClients();
        
        // Save cleared filter state
        saveFilterState();
        
        // Show toast notification
        showToast('フィルターをクリアしました', 'success');
    }

    function getFilteredClients() {
        const personalSettings = loadPersonalSettings(); // フィルターの外で設定を一度だけ読み込む

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

            // Hide inactive filter (個別設定から取得)
            const showInactive = !personalSettings.hideInactiveClients;
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
            // 「ドラッグして幅を調整」のテキストを除去して判定
            const cleanHeaderText = headerText.replace(/ドラッグして幅を調整$/, '');
            const sortKey = headerMap[cleanHeaderText] || headerMap[headerText];
            
            if (sortKey) {
                header.style.cursor = 'pointer';
                header.setAttribute('data-sort-key', sortKey);
                
                const icon = document.createElement('span');
                icon.className = 'sort-icon';
                icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5-5 5 5H7z"/><path d="M7 14l5 5 5-5H7z"/></svg>';
                icon.style.cssText = 'margin-left: 8px; opacity: 0.4; transition: opacity 0.2s; vertical-align: middle;';
                header.appendChild(icon);
            } else {
                // ソートできない列（「編集」など）は通常のカーソルのままにする
                header.style.cursor = 'default';
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

        // 無限ループ防止フラグ
        window.isRenderingClients = true;
        renderClients();
        window.isRenderingClients = false;
        
        updateSortIcons();
    }

    function updateSortIcons() {
        const headers = clientsTableHeadRow.querySelectorAll('th');
        headers.forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (!icon) return;

            const sortKey = header.getAttribute('data-sort-key');
            if (sortKey === currentSortKey) {
                // アクティブソート状態のクラスを追加
                header.classList.add('active-sort');
                
                if (currentSortDirection === 'asc') {
                    icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5H7z"/></svg>';
                } else {
                    icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>';
                }
                icon.style.opacity = '0.9';
                icon.style.color = '#007bff';
            } else {
                // アクティブソート状態のクラスを削除
                header.classList.remove('active-sort');
                
                icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5-5 5 5H7z"/><path d="M7 14l5 5 5-5H7z"/></svg>';
                icon.style.opacity = '0.4';
                icon.style.color = 'inherit';
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
    
    // --- Database Reset Modal Functions ---
    function openDatabaseResetModal() {
        const modal = document.getElementById('database-reset-modal');
        const input = document.getElementById('app-name-input');
        const confirmButton = document.getElementById('confirm-reset-button');
        const status = document.getElementById('verification-status');

        // リセット処理
        input.value = '';
        input.className = '';
        confirmButton.disabled = true;
        status.textContent = '';
        status.className = 'verification-status';

        modal.style.display = 'flex';
        input.focus();
    }

    function closeDatabaseResetModal() {
        const modal = document.getElementById('database-reset-modal');
        modal.style.display = 'none';
    }

    function validateAppName() {
        const input = document.getElementById('app-name-input');
        const confirmButton = document.getElementById('confirm-reset-button');
        const status = document.getElementById('verification-status');
        const expectedName = '事業者管理アプリ';

        if (input.value === expectedName) {
            input.classList.remove('invalid');
            input.classList.add('valid');
            confirmButton.disabled = false;
            status.textContent = '✓ 正しく入力されました';
            status.className = 'verification-status valid';
        } else if (input.value.length > 0) {
            input.classList.remove('valid');
            input.classList.add('invalid');
            confirmButton.disabled = true;
            status.textContent = '✗ アプリ名が正しくありません';
            status.className = 'verification-status invalid';
        } else {
            input.className = '';
            confirmButton.disabled = true;
            status.textContent = '';
            status.className = 'verification-status';
        }
    }

    // --- Database Reset Function ---
    async function resetDatabase() {
        // モーダルを閉じる
        closeDatabaseResetModal();
        
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

    // --- Accordion --- (常に開いた状態に固定のためコメントアウト)
    function toggleAccordion() {
        // アコーディオンを常に開いた状態に維持するため、機能をコメントアウト
        /*
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
        */
        return;
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

    // Other Apps Accordion function removed - functionality moved to analytics.html

    // --- URL Settings Modal Functions ---
    function openUrlSettingsModal() {
        
        originalAppLinksState = JSON.parse(JSON.stringify(appLinks));
        currentEditingAppLinks = JSON.parse(JSON.stringify(appLinks));
        renderUrlListForEdit();
        
        if (urlSettingsModal) {
            urlSettingsModal.style.display = 'block';
        } else {
            console.error('urlSettingsModal element not found!');
        }
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

    // ===== BACKUP MANAGEMENT FUNCTIONALITY =====
    
    // Backup Management Modal elements
    const backupModal = document.getElementById('backup-management-modal');
    const backupSettingsButton = document.getElementById('backup-settings-button-modal');
    const closeBackupModalButton = backupModal.querySelector('.close-button');
    const autoBackupEnabledCheckbox = document.getElementById('auto-backup-enabled');
    const backupFrequencySelect = document.getElementById('backup-frequency');
    const backupTimeSelect = document.getElementById('backup-time');
    const backupMethodSelect = document.getElementById('backup-method');
    const selectBackupFolderButton = document.getElementById('select-backup-folder-button');
    const selectedPathDisplay = document.getElementById('selected-path-display');
    const manualBackupButton = document.getElementById('manual-backup-button');
    const restoreBackupButton = document.getElementById('restore-backup-button');
    const restoreFileInput = document.getElementById('restore-file-input');
    const saveBackupSettingsButton = document.getElementById('save-backup-settings-button');
    const cancelBackupSettingsButton = document.getElementById('cancel-backup-settings-button');
    const lastBackupDateSpan = document.getElementById('last-backup-date');
    const nextBackupDateSpan = document.getElementById('next-backup-date');

    // Open backup management modal
    backupSettingsButton.addEventListener('click', () => {
        loadBackupSettings();
        backupModal.style.display = 'block';
        updateBackupHistory();
    });

    // Close backup management modal
    closeBackupModalButton.addEventListener('click', () => {
        backupModal.style.display = 'none';
    });

    cancelBackupSettingsButton.addEventListener('click', () => {
        backupModal.style.display = 'none';
    });

    // Backup folder selection
    selectBackupFolderButton.addEventListener('click', async () => {
        try {
            if (!window.showDirectoryPicker) {
                toast.show('このブラウザはフォルダ選択に対応していません', 'error');
                return;
            }

            const directoryHandle = await window.showDirectoryPicker();
            
            // 設定を一時保存（実際の保存は設定保存時）
            window.tempBackupSettings = {
                ...SupabaseAPI.getBackupSettings(),
                directoryHandle: directoryHandle,
                selectedPath: directoryHandle.name
            };
            
            selectedPathDisplay.innerHTML = `<small>選択済み: ${directoryHandle.name}</small>`;
            toast.show('バックアップフォルダを選択しました', 'success');
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Folder selection error:', error);
                toast.show(`フォルダ選択エラー: ${error.message}`, 'error');
            }
        }
    });

    // Manual backup
    manualBackupButton.addEventListener('click', async () => {
        // 「ローカルバックアップを実行」ボタンは常にダウンロードフォルダに保存
        const loadingToast = toast.show('ローカルバックアップを作成中...', 'info', 0);
        
        try {
            // 設定に関係なく常にローカルダウンロードを実行
            const result = await SupabaseAPI.downloadBackup();
            
            toast.update(loadingToast, 'ローカルバックアップが正常に完了しました（ダウンロードフォルダに保存）', 'success');
            updateBackupHistory();
        } catch (error) {
            console.error('Manual backup error:', error);
            toast.update(loadingToast, `ローカルバックアップエラー: ${handleSupabaseError(error)}`, 'error');
        }
    });

    // Manual cloud backup
    const manualCloudBackupButton = document.getElementById('manual-cloud-backup-button');
    if (manualCloudBackupButton) {
        manualCloudBackupButton.addEventListener('click', async () => {
            const loadingToast = toast.show('クラウドバックアップを作成中...', 'info', 0);
            
            try {
                const backupData = await SupabaseAPI.createFullBackup();
                const result = await SupabaseAPI.uploadBackupToCloud(backupData);
                toast.update(loadingToast, 'クラウドバックアップが正常に完了しました', 'success');
                updateBackupHistory();
            } catch (error) {
                console.error('Cloud backup error:', error);
                toast.update(loadingToast, `クラウドバックアップエラー: ${handleSupabaseError(error)}`, 'error');
            }
        });
    }

    // Manual full backup (cloud + local)
    const manualFullBackupButton = document.getElementById('manual-full-backup-button');
    if (manualFullBackupButton) {
        manualFullBackupButton.addEventListener('click', async () => {
            const loadingToast = toast.show('フルバックアップを実行中...', 'info', 0);
            
            try {
                const result = await SupabaseAPI.executeFullBackup();
                toast.update(loadingToast, 'フルバックアップ（クラウド+ローカル）が正常に完了しました', 'success');
                updateBackupHistory();
            } catch (error) {
                console.error('Full backup error:', error);
                toast.update(loadingToast, `フルバックアップエラー: ${handleSupabaseError(error)}`, 'error');
            }
        });
    }

    // Restore cloud backup
    const restoreCloudBackupButton = document.getElementById('restore-cloud-backup-button');
    if (restoreCloudBackupButton) {
        restoreCloudBackupButton.addEventListener('click', async () => {
            // 確認ダイアログ
            if (!confirm('クラウドから最新のバックアップを復元します。\n現在のデータは全て置き換えられます。\n復元を実行しますか？')) {
                return;
            }

            const loadingToast = toast.show('クラウドバックアップから復元中...', 'info', 0);
            
            try {
                const backupData = await SupabaseAPI.downloadBackupFromCloud();
                if (!backupData) {
                    toast.update(loadingToast, 'クラウドにバックアップファイルが見つかりません', 'error');
                    return;
                }

                const skipDelete = document.getElementById('restore-skip-delete').checked;
                const results = await SupabaseAPI.restoreFromBackup(backupData, skipDelete);
                
                let message = 'クラウドバックアップからの復元が完了しました:\n\n';
                let totalRestored = 0;
                
                for (const [table, result] of Object.entries(results)) {
                    message += `${table}: ${result.restored}件\n`;
                    totalRestored += result.restored;
                }
                
                toast.update(loadingToast, `復元完了 (${totalRestored}件)`, 'success');
                
                // データを再読み込み
                setTimeout(() => {
                    location.reload();
                }, 1500);
                
            } catch (error) {
                console.error('Cloud restore error:', error);
                toast.update(loadingToast, `クラウド復元エラー: ${handleSupabaseError(error)}`, 'error');
            }
        });
    }

    // Restore backup
    restoreBackupButton.addEventListener('click', () => {
        restoreFileInput.click();
    });

    restoreFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // ファイル形式確認
        if (!file.name.endsWith('.json')) {
            toast.show('JSONファイルを選択してください', 'error');
            return;
        }

        // 確認ダイアログ
        if (!confirm('現在のデータは全て置き換えられます。\n復元を実行しますか？')) {
            return;
        }

        const loadingToast = toast.show('データを復元中...', 'info', 0);
        
        try {
            // ファイルを読み込み
            const fileContent = await readFileAsText(file);
            const backupData = JSON.parse(fileContent);
            
            let results;
            let format = 'JSON';
            
            // 削除スキップオプションを取得
            const skipDelete = document.getElementById('restore-skip-delete').checked;
            
            // JSON形式バックアップの復元
            if (backupData.tables) {
                results = await SupabaseAPI.restoreFromBackup(backupData, skipDelete);
            } else {
                throw new Error('無効なバックアップファイル形式です');
            }
            
            let message = `${format}形式で復元完了:\n`;
            Object.entries(results).forEach(([table, result]) => {
                message += `${table}: ${result.restored}件\n`;
            });
            
            toast.update(loadingToast, `データが正常に復元されました（${format}形式）`, 'success');
            alert(message);
            
            // ページをリロードして最新データを表示
            setTimeout(() => {
                window.location.reload();
            }, 2000);
            
        } catch (error) {
            console.error('Restore error:', error);
            toast.update(loadingToast, `復元エラー: ${error.message}`, 'error');
        }
        
        // ファイル選択をクリア
        restoreFileInput.value = '';
    });

    // Save backup settings
    saveBackupSettingsButton.addEventListener('click', () => {
        const baseSettings = {
            enabled: autoBackupEnabledCheckbox.checked,
            frequency: backupFrequencySelect.value,
            time: backupTimeSelect.value,
            method: backupMethodSelect.value,
            destination: document.getElementById('backup-destination')?.value || 'local'
        };
        
        // 一時保存されたフォルダ設定があれば統合
        const settings = window.tempBackupSettings ? 
            { ...baseSettings, ...window.tempBackupSettings } : 
            baseSettings;
        
        SupabaseAPI.saveBackupSettings(settings);
        
        // 一時設定をクリア
        delete window.tempBackupSettings;
        
        toast.show('バックアップ設定を保存しました', 'success');
        backupModal.style.display = 'none';
        updateBackupHistory();
    });

    // Helper functions for backup management
    function loadBackupSettings() {
        const settings = SupabaseAPI.getBackupSettings();
        
        autoBackupEnabledCheckbox.checked = settings.enabled;
        backupFrequencySelect.value = settings.frequency;
        backupTimeSelect.value = settings.time;
        backupMethodSelect.value = settings.method || 'weekly-rotation';
        
        // バックアップ先の設定を読み込み
        const backupDestination = document.getElementById('backup-destination');
        if (backupDestination) {
            backupDestination.value = settings.destination || 'local';
        }
        
        // フォルダ選択状態を表示
        if (settings.selectedPath) {
            selectedPathDisplay.innerHTML = `<small>選択済み: ${settings.selectedPath}</small>`;
        } else {
            selectedPathDisplay.innerHTML = `<small>未選択（ダウンロードフォルダを使用）</small>`;
        }
    }

    function updateBackupHistory() {
        // 最終クラウドバックアップ日時
        const lastCloudBackup = localStorage.getItem('lastCloudBackupDate');
        const lastCloudBackupDateSpan = document.getElementById('last-cloud-backup-date');
        if (lastCloudBackupDateSpan) {
            if (lastCloudBackup) {
                const date = new Date(lastCloudBackup);
                lastCloudBackupDateSpan.textContent = date.toLocaleString('ja-JP');
            } else {
                lastCloudBackupDateSpan.textContent = '未実行';
            }
        }

        // 最終ローカルバックアップ日時
        const lastBackup = localStorage.getItem('lastBackupDate');
        if (lastBackup) {
            const date = new Date(lastBackup);
            lastBackupDateSpan.textContent = date.toLocaleString('ja-JP');
        } else {
            lastBackupDateSpan.textContent = '未実行';
        }

        // 次回予定
        const nextBackup = localStorage.getItem('nextBackupDate');
        if (nextBackup) {
            const date = new Date(nextBackup);
            nextBackupDateSpan.textContent = date.toLocaleString('ja-JP');
        } else {
            nextBackupDateSpan.textContent = '-';
        }
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'utf-8');
        });
    }

    // Initialize backup system
    function initializeBackupSystem() {
        // 自動バックアップの初期化
        SupabaseAPI.initAutoBackup();
    }

    // Initialize the application
    initializeApp();
    
    // Initialize backup system after app initialization
    setTimeout(() => {
        initializeBackupSystem();
    }, 1000);
    
    // グローバルバックアップデバッグ機能をウィンドウに追加
    window.debugBackup = {
        status: () => SupabaseAPI.logBackupStatus(),
        test: () => SupabaseAPI.testBackupNow(),
        enable: (time = '00:00') => {
            const settings = SupabaseAPI.getBackupSettings();
            settings.enabled = true;
            settings.time = time;
            settings.method = 'cloud';
            SupabaseAPI.saveBackupSettings(settings);
        },
        disable: () => {
            const settings = SupabaseAPI.getBackupSettings();
            settings.enabled = false;
            SupabaseAPI.saveBackupSettings(settings);
        }
    };

    // 基本的なレスポンシブテーブル機能
    function initBasicResponsiveTable() {
        const tableContainer = document.querySelector('.table-container');
        const clientsTable = document.getElementById('clients-table');

        if (!tableContainer || !clientsTable) return;

        // 基本的なレスポンシブ設定
        tableContainer.style.overflowX = 'auto';

        // フォントサイズをユーザー設定に合わせる
        const userFontSize = getCurrentFontSize() / 100;
        clientsTable.style.fontSize = `${14 * userFontSize}px`;
    }
    
    // テーブルモード切り替え機能は削除されました

    // 管理者レポート表示ボタンを追加
    function addAdminReportButton() {
        // 管理者権限チェック
        if (userRole !== 'admin') return;
        
        const accordionContent = document.querySelector('#management-accordion .accordion-content');
        if (!accordionContent) return;
        
        // 既存のボタンがあるかチェック
        const existingButton = accordionContent.querySelector('#admin-report-button');
        if (existingButton) return;
        
        const reportButton = document.createElement('button');
        reportButton.id = 'admin-report-button';
        reportButton.className = 'btn';
        reportButton.innerHTML = '📊 バックアップレポート表示';
        reportButton.style.cssText = `
            width: 100% !important; 
            margin: 5px 0; 
            text-align: center;
            padding: 10px 15px !important;
            min-height: 40px !important;
            background: linear-gradient(135deg, #ff6b35, #f7931e) !important;
            color: white !important;
            border: none !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            box-sizing: border-box !important;
            display: block !important;
            visibility: visible !important;
        `;
        
        reportButton.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                // バックアップ選択モーダルを表示
                await showBackupSelectionModal();
            } catch (error) {
                console.error('バックアップ選択エラー:', error);
                if (window.showToast) {
                    window.showToast('バックアップ選択中にエラーが発生しました', 'error', 3000);
                }
            }
        });
        
        // バックアップ選択モーダル機能を追加
        async function showBackupSelectionModal() {
            try {
                // Supabase Storageから利用可能なバックアップファイルを取得
                
                // まずweeklyフォルダの曜日フォルダ一覧を取得
                const { data: dayFolders, error: listError } = await supabase.storage
                    .from('backups')
                    .list('weekly', { limit: 100 });

                if (listError) {
                    console.error('バックアップファイル一覧取得エラー:', listError);
                    throw new Error('バックアップファイル一覧の取得に失敗しました');
                }

                // 各曜日フォルダからJSONファイルを取得
                let allBackupFiles = [];
                for (const folder of dayFolders || []) {
                    if (folder.name && !folder.name.includes('.')) { // フォルダのみ（ファイルは除外）
                        try {
                            const { data: filesInFolder, error: folderError } = await supabase.storage
                                .from('backups')
                                .list(`weekly/${folder.name}`, { limit: 10 });
                            
                            if (!folderError && filesInFolder) {
                                // フォルダ名をファイル名に追加
                                filesInFolder.forEach(file => {
                                    if (file.name.endsWith('.json')) {
                                        allBackupFiles.push({
                                            ...file,
                                            name: `${folder.name}/${file.name}`,
                                            created_at: file.created_at || folder.created_at,
                                            updated_at: file.updated_at || folder.updated_at
                                        });
                                    }
                                });
                            }
                        } catch (e) {
                            console.warn(`フォルダ ${folder.name} の読み込みをスキップ:`, e);
                        }
                    }
                }
                
                const backupFiles = allBackupFiles;

                // レポートファイルも取得
                const { data: reportFiles, error: reportListError } = await supabase.storage
                    .from('backups')
                    .list('reports', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

                if (reportListError) {
                    console.warn('レポートファイル一覧取得エラー:', reportListError);
                }

                // バックアップ選択モーダルを作成
                const modal = createBackupSelectionModal(backupFiles || [], reportFiles || []);
                document.body.appendChild(modal);

            } catch (error) {
                console.error('バックアップ選択モーダル表示エラー:', error);
                if (window.showToast) {
                    window.showToast(error.message || 'バックアップ一覧の取得に失敗しました', 'error', 3000);
                }
            }
        }

        function createBackupSelectionModal(backupFiles, reportFiles) {
            const modal = document.createElement('div');
            modal.id = 'backup-selection-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.5); z-index: 10000; display: flex; 
                justify-content: center; align-items: center;
            `;

            // バックアップリストを作成
            let backupListHTML = '';
            const combinedList = [];

            // バックアップファイル（データファイル）
            backupFiles.forEach(file => {
                if (file.name.endsWith('.json')) {
                    const date = extractDateFromFileName(file.name);
                    const size = formatFileSize(file.metadata?.size || 0);
                    
                    // Supabaseのフォルダ構造: weekly/Friday/jigyosya-backup-Friday.json
                    // list('weekly')から返される file.name = 'Friday/jigyosya-backup-Friday.json'
                    const folder = file.name.includes('/') ? file.name.split('/')[0] : 'weekly';
                    const filePath = `weekly/${file.name}`;
                    
                    combinedList.push({
                        type: 'backup',
                        name: file.name,
                        displayName: `📊 ${date} (${folder}) - データバックアップ`,
                        size: size,
                        fileSize: file.metadata?.size || 0,
                        created_at: file.created_at,
                        updated_at: file.updated_at,
                        path: filePath
                    });
                }
            });

            // レポートファイル
            reportFiles.forEach(file => {
                if (file.name.endsWith('.json')) {
                    const date = extractDateFromFileName(file.name);
                    const size = formatFileSize(file.metadata?.size || 0);
                    combinedList.push({
                        type: 'report',
                        name: file.name,
                        displayName: `📋 ${date} - バックアップレポート`,
                        size: size,
                        fileSize: file.metadata?.size || 0,
                        created_at: file.created_at,
                        updated_at: file.updated_at,
                        path: `reports/${file.name}`
                    });
                }
            });

            // 更新日時でソート（新しい順）- 最新のバックアップを上に表示
            combinedList.sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at);
                const dateB = new Date(b.updated_at || b.created_at);
                return dateB - dateA;
            });

            combinedList.forEach(item => {
                // 更新日時を優先、なければ作成日時を使用
                const displayDate = new Date(item.updated_at || item.created_at).toLocaleString('ja-JP');
                const badgeColor = item.type === 'backup' ? '#007bff' : '#28a745';
                const badgeText = item.type === 'backup' ? 'データ' : 'レポート';
                
                backupListHTML += `
                    <div class="backup-item" data-path="${item.path}" data-type="${item.type}" 
                         style="padding: 12px; border: 1px solid #dee2e6; border-radius: 8px; margin-bottom: 8px; 
                                cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 500; margin-bottom: 4px;">${item.displayName}</div>
                            <div style="font-size: 12px; color: #6c757d;">更新: ${displayDate} | サイズ: ${item.size}</div>
                        </div>
                        <div style="background: ${badgeColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                            ${badgeText}
                        </div>
                    </div>
                `;
            });

            if (combinedList.length === 0) {
                backupListHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">利用可能なバックアップがありません</p>';
            }

            modal.innerHTML = `
                <div style="
                    background: white; border-radius: 12px; padding: 30px; 
                    max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #343a40;">📁 バックアップ選択</h2>
                        <button id="close-selection-modal" style="
                            background: #6c757d; color: white; border: none; 
                            border-radius: 50%; width: 30px; height: 30px; cursor: pointer;
                            display: flex; align-items: center; justify-content: center;
                        ">×</button>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <p style="color: #6c757d; margin: 0;">
                            👆 閲覧したいバックアップまたはレポートを選択してください。<br>
                            📊 データバックアップ: 実際のデータ内容を確認<br>
                            📋 レポート: バックアップの統計情報を確認
                        </p>
                    </div>

                    <div id="backup-list" style="max-height: 400px; overflow-y: auto;">
                        ${backupListHTML}
                    </div>
                </div>
            `;

            // イベントリスナーを追加
            modal.querySelector('#close-selection-modal').addEventListener('click', () => {
                modal.remove();
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });

            // バックアップアイテムのクリックイベント
            modal.querySelectorAll('.backup-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const path = item.dataset.path;
                    const type = item.dataset.type;
                    modal.remove();
                    await loadAndDisplayBackup(path, type);
                });

                // ホバーエフェクト
                item.addEventListener('mouseenter', () => {
                    item.style.backgroundColor = '#f8f9fa';
                    item.style.borderColor = '#007bff';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.backgroundColor = '';
                    item.style.borderColor = '#dee2e6';
                });
            });

            return modal;
        }

        function extractDateFromFileName(fileName) {
            // ファイル名から日付を抽出
            const matches = fileName.match(/(\d{4}-\d{2}-\d{2})/);
            if (matches) {
                return new Date(matches[1]).toLocaleDateString('ja-JP');
            }
            
            // 週次バックアップの場合（Friday/jigyosya-backup-Friday.json形式）
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayNamesJp = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
            
            for (let i = 0; i < dayNames.length; i++) {
                if (fileName.includes(dayNames[i])) {
                    return `最新 (${dayNamesJp[i]})`;
                }
            }
            
            return fileName;
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        async function loadAndDisplayBackup(path, type) {
            try {
                if (window.showToast) {
                    window.showToast('バックアップを読み込み中...', 'info', 2000);
                }

                const { data, error } = await supabase.storage
                    .from('backups')
                    .download(path);

                if (error) {
                    throw new Error(`ファイルの取得に失敗しました: ${error.message}`);
                }

                const contentText = await data.text();
                const contentData = JSON.parse(contentText);

                if (type === 'report') {
                    // レポートファイルの場合は既存のレポート表示機能を使用
                    SupabaseAPI.showAdminBackupReport(contentData, data.size, path);
                } else {
                    // データファイルの場合は新しい詳細表示機能を使用
                    showBackupDataModal(contentData, data.size, path);
                }

            } catch (error) {
                console.error('バックアップ読み込みエラー:', error);
                if (window.showToast) {
                    window.showToast(error.message || 'バックアップの読み込みに失敗しました', 'error', 3000);
                }
            }
        }

        function showBackupDataModal(backupData, fileSize, filePath) {
            // データファイル表示用のモーダル（簡単な統計情報）
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.5); z-index: 10000; display: flex; 
                justify-content: center; align-items: center;
            `;

            const fileSizeKB = Math.round(fileSize / 1024);
            
            // バックアップデータの構造確認とレコード数計算の修正
            const tablesData = backupData.tables || backupData;
            const totalRecords = Object.values(tablesData).reduce((sum, table) => 
                sum + (Array.isArray(table) ? table.length : 0), 0);

            let tableStatsHTML = '';
            for (const [tableName, records] of Object.entries(tablesData)) {
                if (Array.isArray(records)) {
                    const count = records.length;
                    const percentage = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : '0.0';
                    tableStatsHTML += `
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${tableName}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #007bff;">${count} 件</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #6c757d;">${percentage}%</td>
                        </tr>
                    `;
                }
            }

            modal.innerHTML = `
                <div style="
                    background: white; border-radius: 12px; padding: 30px; 
                    max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #343a40;">📊 バックアップデータ詳細</h2>
                        <button id="close-data-modal" style="
                            background: #6c757d; color: white; border: none; 
                            border-radius: 50%; width: 30px; height: 30px; cursor: pointer;
                        ">×</button>
                    </div>

                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">📁 ${filePath}</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #007bff;">${totalRecords}</div>
                                <div style="color: #6c757d; font-size: 14px;">総レコード数</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #28a745;">${fileSizeKB} KB</div>
                                <div style="color: #6c757d; font-size: 14px;">ファイルサイズ</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #17a2b8;">${Object.keys(tablesData).length}</div>
                                <div style="color: #6c757d; font-size: 14px;">テーブル数</div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">📋 テーブル別レコード数</h3>
                        <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f8f9fa;">
                                        <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">テーブル名</th>
                                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #495057;">レコード数</th>
                                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #495057;">比率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableStatsHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 8px; border-left: 4px solid #007bff;">
                        <p style="margin: 0; color: #004085; font-size: 14px;">
                            💡 <strong>ヒント:</strong> このデータファイルには実際のレコード内容が含まれています。
                            レポートファイルではバックアップ実行時の統計情報を確認できます。
                        </p>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                        <button id="download-data-btn" style="
                            background: #28a745; color: white; border: none; 
                            padding: 10px 20px; border-radius: 6px; cursor: pointer;
                            font-size: 14px; font-weight: 500;
                        ">📥 データダウンロード</button>
                        <button id="close-data-modal-btn" style="
                            background: #007bff; color: white; border: none; 
                            padding: 10px 30px; border-radius: 6px; cursor: pointer;
                            font-size: 16px; font-weight: 500;
                        ">閉じる</button>
                    </div>
                </div>
            `;

            // イベントリスナーを追加
            const closeDataModal = () => modal.remove();
            
            modal.querySelector('#close-data-modal').addEventListener('click', closeDataModal);
            modal.querySelector('#close-data-modal-btn').addEventListener('click', closeDataModal);
            
            // ダウンロードボタンのイベントリスナー
            modal.querySelector('#download-data-btn').addEventListener('click', () => {
                try {
                    const fileName = `backup-data-${new Date().toISOString().split('T')[0]}.json`;
                    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    if (window.showToast) {
                        window.showToast(`バックアップデータ "${fileName}" をダウンロードしました`, 'success', 3000);
                    }
                } catch (error) {
                    console.error('データダウンロードエラー:', error);
                    if (window.showToast) {
                        window.showToast('データダウンロードに失敗しました', 'error', 3000);
                    }
                }
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeDataModal();
                }
            });

            document.body.appendChild(modal);
        }
        
        // ユーザー情報セクションの前に挿入
        const userInfoSection = accordionContent.querySelector('.user-info-section');
        if (userInfoSection) {
            userInfoSection.parentNode.insertBefore(reportButton, userInfoSection);
        } else {
            // フォールバック: ユーザー情報セクションの前に挿入
            const userInfoSection = accordionContent.querySelector('.user-info-section');
            if (userInfoSection) {
                userInfoSection.parentNode.insertBefore(reportButton, userInfoSection);
            } else {
                accordionContent.appendChild(reportButton);
            }
        }
    }
    
    // Font size control functions
    function loadFontSize() {
        const savedFontSize = localStorage.getItem('app-font-size');
        if (savedFontSize) {
            const fontSize = parseInt(savedFontSize);
            applyFontSize(fontSize);
        } else {
            updateFontSizeDisplay(100);
        }
    }

    function adjustFontSize(change) {
        const currentFontSize = getCurrentFontSize();
        const newFontSize = Math.max(70, Math.min(150, currentFontSize + change));
        applyFontSize(newFontSize);
        saveFontSize(newFontSize);
    }

    function resetFontSize() {
        applyFontSize(100);
        saveFontSize(100);
    }

    function getCurrentFontSize() {
        const savedFontSize = localStorage.getItem('app-font-size');
        return savedFontSize ? parseInt(savedFontSize) : 100;
    }

    function applyFontSize(size) {
        document.documentElement.style.fontSize = `${size}%`;
        updateFontSizeDisplay(size);
        
        // テーブルのフォントサイズも更新
        updateTableFontSize();
    }
    
    function updateTableFontSize() {
        const clientsTable = document.getElementById('clients-table');
        if (!clientsTable) return;
        
        const userFontSize = getCurrentFontSize() / 100;
        const containerWidth = document.querySelector('.table-container')?.offsetWidth || 1200;
        
        // 画面幅に応じたベースサイズにユーザー設定を適用
        if (containerWidth < 800) {
            clientsTable.style.fontSize = `${11 * userFontSize}px`;
        } else if (containerWidth < 1200) {
            clientsTable.style.fontSize = `${12 * userFontSize}px`;
        } else {
            clientsTable.style.fontSize = `${14 * userFontSize}px`;
        }
    }

    function updateFontSizeDisplay(size) {
        const display = document.getElementById('font-size-display');
        if (display) {
            display.textContent = `${size}%`;
        }
    }

    function saveFontSize(size) {
        localStorage.setItem('app-font-size', size.toString());
    }

    // ページ読み込み時にフォントサイズを適用
    loadFontSize();

    // 基本的なレスポンシブテーブル機能を初期化
    setTimeout(() => {
        initBasicResponsiveTable();
    }, 1500);

    // カバーレイヤー制御機能
    const coverOverlay = document.getElementById('cover-overlay');
    const showCoverBtn = document.getElementById('show-cover-btn');
    const hideCoverBtn = document.getElementById('hide-cover-btn');
    const focusModeBtn = document.getElementById('focus-mode-btn');

    // カバー表示
    showCoverBtn?.addEventListener('click', () => {
        coverOverlay.style.display = 'block';
        coverOverlay.style.zIndex = '1000';
        coverOverlay.style.opacity = '0';

        setTimeout(() => {
            coverOverlay.style.opacity = '1';
            coverOverlay.style.pointerEvents = 'auto';
        }, 50);

        showCoverBtn.style.display = 'none';
    });

    // カバー非表示
    hideCoverBtn?.addEventListener('click', () => {
        coverOverlay.style.opacity = '0';
        coverOverlay.style.pointerEvents = 'none';
        setTimeout(() => {
            coverOverlay.style.display = 'none';
            showCoverBtn.style.display = 'block';
        }, 300);
    });

    // 集中モード（カバー+アコーディオン閉じる）
    focusModeBtn?.addEventListener('click', () => {
        // 全アコーディオンを閉じる
        document.querySelectorAll('.accordion-content').forEach(content => {
            content.style.display = 'none';
        });
        document.querySelectorAll('.accordion-icon').forEach(icon => {
            icon.textContent = '▼';
        });

        // カバーを非表示
        hideCoverBtn.click();
    });

    // Escキーでカバー切り替え
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (coverOverlay.style.display === 'block') {
                hideCoverBtn.click();
            } else {
                showCoverBtn.click();
            }
        }
    });
});