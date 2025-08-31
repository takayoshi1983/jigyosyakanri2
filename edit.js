import { SupabaseAPI, handleSupabaseError } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Element Selectors ---
    const pageTitle = document.querySelector('h1');
    const clientNameDisplay = document.getElementById('client-name-display');
    const clientNoInput = document.getElementById('client-no');
    const clientNameInput = document.getElementById('client-name');
    const staffSelect = document.getElementById('staff-select');
    const fiscalMonthSelect = document.getElementById('fiscal-month');
    const accountingMethodSelect = document.getElementById('accounting-method');
    const saveButton = document.getElementById('save-button');
    
    // Status and loading elements
    const connectionStatus = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // 削除関連の要素
    const inactiveButton = document.getElementById('inactive-button');
    const deleteButton = document.getElementById('delete-button');
    const reactivateButton = document.getElementById('reactivate-button');
    const inactiveStatusBadge = document.getElementById('inactive-status-badge');
    const deleteModal = document.getElementById('delete-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalClientNo = document.getElementById('modal-client-no');
    const modalClientName = document.getElementById('modal-client-name');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    const dangerZone = document.querySelector('.danger-zone');

    // --- State Variables ---
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id') || urlParams.get('no');
    const isNewMode = !clientId;
    let currentClient = null;
    let staffs = [];
    let currentModalAction = null;

    // --- Utility Functions ---
    function showStatus(message, type = 'info') {
        connectionStatus.className = type;
        connectionStatus.style.display = 'block';
        statusText.textContent = message;
    }

    function hideStatus() {
        connectionStatus.style.display = 'none';
    }

    function showLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
    }

    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    function showNotification(message, type = 'info') {
        let notification = document.getElementById('edit-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'edit-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 16px;
                border-radius: 4px;
                color: white;
                font-weight: bold;
                z-index: 1000;
                max-width: 300px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transform: translateX(100%);
                transition: transform 0.3s ease;
            `;
            document.body.appendChild(notification);
        }

        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;

        notification.style.transform = 'translateX(0)';
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
        }, 3000);
    }

    // --- Data Fetching Functions ---
    async function fetchStaffs() {
        try {
            const staffsData = await SupabaseAPI.getStaffs();
            return staffsData || [];
        } catch (error) {
            console.error('Error fetching staffs:', error);
            return [];
        }
    }

    async function fetchClientDetails(id) {
        try {
            const client = await SupabaseAPI.getClient(id);
            return client;
        } catch (error) {
            console.error('Error fetching client details:', error);
            return null;
        }
    }

    // --- UI Population Functions ---
    function populateStaffSelect() {
        staffSelect.innerHTML = '<option value="">担当者を選択してください</option>';
        
        staffs.forEach(staff => {
            const option = document.createElement('option');
            option.value = staff.id;
            option.textContent = staff.name;
            staffSelect.appendChild(option);
        });

        // Update custom dropdown trigger
        const customTrigger = staffSelect.parentElement.querySelector('.custom-select-trigger');
        if (customTrigger) {
            customTrigger.textContent = '担当者を選択してください';
        }
    }

    function populateFormFields(client) {
        clientNoInput.value = client.id || '';
        clientNameInput.value = client.name || '';
        
        // Staff selection
        if (client.staff_id) {
            staffSelect.value = client.staff_id;
            const selectedStaff = staffs.find(s => s.id === client.staff_id);
            if (selectedStaff) {
                const customTrigger = staffSelect.parentElement.querySelector('.custom-select-trigger');
                if (customTrigger) {
                    customTrigger.textContent = selectedStaff.name;
                }
            }
        }

        // Fiscal month selection
        if (client.fiscal_month) {
            fiscalMonthSelect.value = client.fiscal_month;
            const customTrigger = fiscalMonthSelect.parentElement.querySelector('.custom-select-trigger');
            if (customTrigger) {
                customTrigger.textContent = `${client.fiscal_month}月`;
            }
        }

        // Accounting method selection
        if (client.accounting_method) {
            accountingMethodSelect.value = client.accounting_method;
            const customTrigger = accountingMethodSelect.parentElement.querySelector('.custom-select-trigger');
            if (customTrigger) {
                customTrigger.textContent = client.accounting_method;
            }
        }

        // Update display name and status
        clientNameDisplay.textContent = client.name || '';
        
        // Show/hide inactive status
        if (client.status === 'deleted') {
            inactiveStatusBadge.style.display = 'inline';
            if (reactivateButton) reactivateButton.style.display = 'inline-block';
            if (inactiveButton) inactiveButton.style.display = 'none';
        } else {
            inactiveStatusBadge.style.display = 'none';
            if (reactivateButton) reactivateButton.style.display = 'none';
            if (inactiveButton) inactiveButton.style.display = 'inline-block';
        }
    }

    // --- Mode Initialization ---
    function initializeNewMode() {
        pageTitle.textContent = '顧客情報新規作成（Supabase版）';
        clientNameDisplay.textContent = '新規顧客';
        
        // Hide danger zone for new mode
        if (dangerZone) {
            dangerZone.style.display = 'none';
        }
        
        // Set default values
        clientNoInput.value = '';
        clientNameInput.value = '';
        
        // Set default accounting method
        accountingMethodSelect.value = '記帳代行';
        const customTrigger = accountingMethodSelect.parentElement.querySelector('.custom-select-trigger');
        if (customTrigger) {
            customTrigger.textContent = '記帳代行';
        }
    }

    async function initializeEditMode() {
        try {
            pageTitle.textContent = '顧客情報編集（Supabase版）';
            
            currentClient = await fetchClientDetails(clientId);
            if (!currentClient) {
                throw new Error('顧客データが見つかりません');
            }

            populateFormFields(currentClient);
            
            // Show danger zone for edit mode
            if (dangerZone) {
                dangerZone.style.display = 'flex';
            }

        } catch (error) {
            console.error('Error initializing edit mode:', error);
            showStatus('❌ 顧客データの取得に失敗しました: ' + handleSupabaseError(error), 'error');
            throw error;
        }
    }

    // --- Save Handler ---
    async function saveDataHandler() {
        try {
            showLoading();
            showStatus('保存中...', 'warning');

            // Validate form data
            const formData = {
                name: clientNameInput.value.trim(),
                staff_id: staffSelect.value ? parseInt(staffSelect.value) : null,
                fiscal_month: fiscalMonthSelect.value ? parseInt(fiscalMonthSelect.value) : null,
                accounting_method: accountingMethodSelect.value || null
            };

            if (!formData.name) {
                throw new Error('事業所名は必須です');
            }

            let result;
            if (isNewMode) {
                // Create new client
                formData.status = 'active';
                result = await SupabaseAPI.createClient(formData);
                showNotification('新規顧客が作成されました', 'success');
                showStatus('✅ 新規顧客作成完了', 'success');
                
                // Redirect to edit mode for the new client
                setTimeout(() => {
                    window.location.href = `edit.html?id=${result.id}`;
                }, 1500);
                
            } else {
                // Update existing client
                result = await SupabaseAPI.updateClient(clientId, formData);
                currentClient = result;
                
                // Update display
                populateFormFields(currentClient);
                
                showNotification('顧客情報が更新されました', 'success');
                showStatus('✅ 更新完了', 'success');
                setTimeout(hideStatus, 2000);
            }

        } catch (error) {
            console.error('Error saving data:', error);
            showStatus('❌ 保存エラー: ' + handleSupabaseError(error), 'error');
            showNotification('保存でエラーが発生しました', 'error');
        } finally {
            hideLoading();
        }
    }

    // --- Modal Functions ---
    function showDeleteModal(action) {
        if (!deleteModal || !currentClient) return;

        currentModalAction = action;
        
        // Update modal content based on action
        switch (action) {
            case 'inactive':
                modalTitle.textContent = '関与終了の確認';
                modalMessage.textContent = 'この顧客を関与終了にしますか？データは保持されますが、一覧から非表示になります。';
                break;
            case 'delete':
                modalTitle.textContent = '削除の確認';
                modalMessage.textContent = 'この顧客を削除しますか？この操作は取り消せません。';
                break;
            case 'reactivate':
                modalTitle.textContent = '復活の確認';
                modalMessage.textContent = 'この顧客を復活させますか？一覧に再表示されます。';
                break;
        }

        modalClientNo.textContent = currentClient.id || '';
        modalClientName.textContent = currentClient.name || '';
        
        deleteModal.style.display = 'flex';
    }

    function hideDeleteModal() {
        if (deleteModal) {
            deleteModal.style.display = 'none';
            currentModalAction = null;
        }
    }

    async function handleModalConfirm() {
        if (!currentModalAction || !currentClient) return;

        try {
            showLoading();
            hideDeleteModal();

            switch (currentModalAction) {
                case 'inactive':
                    await SupabaseAPI.deleteClient(currentClient.id);
                    currentClient.status = 'deleted';
                    showNotification('顧客を関与終了にしました', 'success');
                    break;
                    
                case 'reactivate':
                    await SupabaseAPI.restoreClient(currentClient.id);
                    currentClient.status = 'active';
                    showNotification('顧客を復活させました', 'success');
                    break;
                    
                case 'delete':
                    // For now, we'll use the same delete function as inactive
                    // In a real implementation, you might want a separate hard delete function
                    await SupabaseAPI.deleteClient(currentClient.id);
                    showNotification('顧客を削除しました', 'success');
                    
                    // Redirect to main page after delete
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 2000);
                    return;
            }

            // Update UI after status change
            populateFormFields(currentClient);
            
        } catch (error) {
            console.error('Error handling modal confirm:', error);
            showNotification('操作でエラーが発生しました: ' + handleSupabaseError(error), 'error');
        } finally {
            hideLoading();
        }
    }

    // --- Custom Dropdown Initialization ---
    function initializeAllCustomDropdowns() {
        // This function should initialize custom dropdowns
        // The actual implementation depends on custom-dropdown.js
        const customSelectWrappers = document.querySelectorAll('.custom-select-wrapper');
        customSelectWrappers.forEach(wrapper => {
            const trigger = wrapper.querySelector('.custom-select-trigger');
            const options = wrapper.querySelector('.custom-options');
            const select = wrapper.querySelector('select');

            if (trigger && options && select) {
                // Populate options
                options.innerHTML = '';
                Array.from(select.options).forEach(option => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'custom-option';
                    optionDiv.textContent = option.textContent;
                    optionDiv.dataset.value = option.value;
                    options.appendChild(optionDiv);
                });

                // Add event listeners
                trigger.addEventListener('click', () => {
                    options.style.display = options.style.display === 'block' ? 'none' : 'block';
                });

                options.addEventListener('click', (e) => {
                    if (e.target.classList.contains('custom-option')) {
                        const value = e.target.dataset.value;
                        const text = e.target.textContent;
                        
                        select.value = value;
                        trigger.textContent = text;
                        options.style.display = 'none';

                        // Trigger change event
                        const event = new Event('change');
                        select.dispatchEvent(event);
                    }
                });
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select-wrapper')) {
                customSelectWrappers.forEach(wrapper => {
                    const options = wrapper.querySelector('.custom-options');
                    if (options) options.style.display = 'none';
                });
            }
        });
    }

    // --- Event Listeners ---
    function addEventListeners() {
        // Save button
        saveButton.addEventListener('click', saveDataHandler);
        
        // Modal events
        if (modalCancel) {
            modalCancel.addEventListener('click', hideDeleteModal);
        }
        
        if (modalConfirm) {
            modalConfirm.addEventListener('click', handleModalConfirm);
        }

        // Danger zone buttons (only in edit mode)
        if (!isNewMode) {
            if (inactiveButton) {
                inactiveButton.addEventListener('click', () => showDeleteModal('inactive'));
            }
            
            if (deleteButton) {
                deleteButton.addEventListener('click', () => showDeleteModal('delete'));
            }
            
            if (reactivateButton) {
                reactivateButton.addEventListener('click', () => showDeleteModal('reactivate'));
            }
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && deleteModal && deleteModal.style.display === 'flex') {
                hideDeleteModal();
            }
        });

        // Click outside modal to close
        if (deleteModal) {
            deleteModal.addEventListener('click', (e) => {
                if (e.target === deleteModal) {
                    hideDeleteModal();
                }
            });
        }
    }

    // --- Main Initialization ---
    async function initializeApp() {
        try {
            showStatus('アプリケーションを初期化中...', 'warning');

            // Fetch staffs data
            staffs = await fetchStaffs();
            populateStaffSelect();

            // Initialize based on mode
            if (isNewMode) {
                initializeNewMode();
            } else {
                await initializeEditMode();
            }

            // Initialize custom dropdowns
            initializeAllCustomDropdowns();
            
            // Add event listeners
            addEventListeners();

            showStatus('✅ 初期化完了', 'success');
            setTimeout(hideStatus, 2000);

        } catch (error) {
            console.error('Initialization failed:', error);
            showStatus('❌ 初期化エラー: ' + handleSupabaseError(error), 'error');
            
            pageTitle.textContent = 'エラー';
            document.getElementById('edit-form').innerHTML = `
                <div style="color: red; padding: 20px; text-align: center;">
                    <h3>エラーが発生しました</h3>
                    <p>${handleSupabaseError(error)}</p>
                    <button onclick="location.reload()">再読み込み</button>
                </div>
            `;
        }
    }

    // Start the application
    initializeApp();
});