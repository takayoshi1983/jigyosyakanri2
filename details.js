import { SupabaseAPI, handleSupabaseError } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Element Selectors ---
    const clientInfoArea = document.getElementById('client-info-area');
    const detailsTableHead = document.querySelector('#details-table thead');
    const detailsTableBody = document.querySelector('#details-table tbody');
    const notesTableHead = document.querySelector('#notes-table thead');
    const notesTableBody = document.querySelector('#notes-table tbody');
    const yearFilter = document.getElementById('year-filter');
    const editTasksButton = document.getElementById('edit-tasks-button');
    const saveChangesButton = document.getElementById('save-changes-button');
    const finalizeYearButton = document.getElementById('finalize-year-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    const connectionStatus = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');

    // --- Task Edit Modal Elements ---
    const taskEditModal = document.getElementById('task-edit-modal');
    const taskListContainer = document.getElementById('task-list-container');
    const newTaskInput = document.getElementById('new-task-input');
    const addTaskButton = document.getElementById('add-task-button');
    const saveTasksButton = document.getElementById('save-tasks-button');
    const cancelTasksButton = document.getElementById('cancel-tasks-button');
    const closeModalButton = taskEditModal.querySelector('.close-button');

    // --- Zoom Slider Elements ---
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');
    const mainContainer = document.querySelector('.container');

    // --- State Variables ---
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id') || urlParams.get('no'); // Support both parameters
    let clientDetails = null;
    let currentYearSelection = new Date().getFullYear().toString();
    let monthsToDisplay = [];
    let allTaskNames = [];
    let isSaving = false;
    let hasUnsavedChanges = false;
    let isEditingMode = true;

    // --- Utility Functions ---
    function showStatus(message, type = 'info') {
        if (!connectionStatus || !statusText) return;
        connectionStatus.className = type;
        connectionStatus.style.display = 'block';
        statusText.textContent = message;
    }

    function hideStatus() {
        if (connectionStatus) connectionStatus.style.display = 'none';
    }

    function showLoading() {
        if (loadingIndicator) loadingIndicator.style.display = 'block';
    }

    function hideLoading() {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }

    function setUnsavedChanges(isDirty) {
        hasUnsavedChanges = isDirty;
        saveChangesButton.disabled = !isDirty || isSaving;
    }

    function showNotification(message, type = 'info') {
        let notification = document.getElementById('task-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'task-notification';
            document.body.appendChild(notification);
        }
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.transform = 'translateX(0)';
        setTimeout(() => {
            notification.style.transform = 'translateX(120%)';
        }, 3000);
    }

    // --- Data Loading Functions ---
    async function loadClientDetails() {
        showLoading();
        showStatus('クライアントデータを読み込み中...', 'warning');
        try {
            clientDetails = await SupabaseAPI.getClient(clientId);
            if (!clientDetails) throw new Error('クライアントが見つかりません');

            clientDetails.custom_tasks_by_year = clientDetails.custom_tasks_by_year || {};
            clientDetails.finalized_years = clientDetails.finalized_years || [];

            await checkAndSetupInitialTasks();
            showStatus('✅ データ読み込み完了', 'success');
            setTimeout(hideStatus, 2000);
        } catch (error) {
            console.error('Error loading client details:', error);
            showStatus(`❌ データ読み込みエラー: ${handleSupabaseError(error)}`, 'error');
            throw error;
        } finally {
            hideLoading();
        }
    }

    async function checkAndSetupInitialTasks() {
        try {
            const setupCheck = await SupabaseAPI.checkIfClientNeedsInitialSetup(clientId);
            if (setupCheck.needs) {
                showStatus('初期タスクを設定中...', 'warning');
                const setupResult = await SupabaseAPI.setupInitialTasksForClient(clientId);
                clientDetails.custom_tasks_by_year = setupResult.client.custom_tasks_by_year;
                showNotification(`${clientDetails.accounting_method}の初期タスクを設定しました`, 'success');
            }
        } catch (error) {
            console.error('Error setting up initial tasks:', error);
            showNotification('初期タスク設定でエラーが発生しました', 'error');
        }
    }

    // --- Year Management ---
    function determineOptimalYear() {
        if (!clientDetails || !clientDetails.finalized_years || clientDetails.finalized_years.length === 0) {
            return new Date().getFullYear().toString();
        }
        const latestFinalizedYear = Math.max(...clientDetails.finalized_years.map(y => parseInt(y)));
        return (latestFinalizedYear + 1).toString();
    }

    function inheritFromPreviousYear(targetYear) {
        if (!clientDetails.custom_tasks_by_year) return [];
        const targetYearNum = parseInt(targetYear);
        for (let year = targetYearNum - 1; year >= targetYearNum - 10; year--) {
            const yearStr = year.toString();
            if (clientDetails.custom_tasks_by_year[yearStr]?.length > 0) {
                return clientDetails.custom_tasks_by_year[yearStr];
            }
        }
        return [];
    }

    function propagateTasksToFutureYears(fromYear, newTasks) {
        if (!clientDetails.custom_tasks_by_year || !clientDetails.finalized_years) return;
        const fromYearNum = parseInt(fromYear);
        const endYear = new Date().getFullYear() + 10;
        let propagatedCount = 0;
        for (let year = fromYearNum + 1; year <= endYear; year++) {
            const yearStr = year.toString();
            if (!clientDetails.finalized_years.includes(yearStr) && clientDetails.custom_tasks_by_year[yearStr]) {
                clientDetails.custom_tasks_by_year[yearStr] = [...newTasks];
                propagatedCount++;
            }
        }
        if (propagatedCount > 0) {
            showNotification(`タスク変更を${propagatedCount}つの未完了年度にも適用しました`, 'info');
        }
    }

    // --- Year Finalization ---
    async function finalizeYear(year, shouldFinalize) {
        showStatus('年度確定処理中...', 'warning');
        try {
            clientDetails.finalized_years = clientDetails.finalized_years || [];
            if (shouldFinalize) {
                if (!clientDetails.finalized_years.includes(year)) clientDetails.finalized_years.push(year);
            } else {
                clientDetails.finalized_years = clientDetails.finalized_years.filter(y => y !== year);
            }
            await SupabaseAPI.updateClient(clientId, { finalized_years: clientDetails.finalized_years });
            const action = shouldFinalize ? '確定' : '確定解除';
            showNotification(`${year}年度を${action}しました`, 'success');
            updateFinalizeButtonState();
            updateEditingInterface();
        } catch (error) {
            showStatus(`❌ 年度確定エラー: ${handleSupabaseError(error)}`, 'error');
        }
    }

    function updateFinalizeButtonState() {
        if (!finalizeYearButton) return;
        const isYearFinalized = clientDetails.finalized_years?.includes(currentYearSelection);
        finalizeYearButton.textContent = isYearFinalized ? `${currentYearSelection}年度の確定を解除` : `${currentYearSelection}年度のタスクを確定`;
        finalizeYearButton.style.backgroundColor = isYearFinalized ? '#FF5722' : '#4CAF50';
    }

    function updateEditingInterface() {
        const isYearFinalized = clientDetails.finalized_years?.includes(currentYearSelection);
        isEditingMode = !isYearFinalized;
        editTasksButton.disabled = isYearFinalized;
        editTasksButton.textContent = isYearFinalized ? '確定済み (編集不可)' : 'タスクの編集';
        updateTableEditingState();
    }

    function updateTableEditingState() {
        document.querySelectorAll('#details-table input, #notes-table input, #notes-table textarea').forEach(input => {
            input.disabled = !isEditingMode;
        });
    }

    // --- Task Management ---
    function getCurrentYearTasks() {
        let tasks = clientDetails.custom_tasks_by_year?.[currentYearSelection];
        if (!tasks || tasks.length === 0) {
            tasks = inheritFromPreviousYear(currentYearSelection);
            if (tasks.length > 0) {
                clientDetails.custom_tasks_by_year[currentYearSelection] = [...tasks];
            }
        }
        return tasks || [];
    }

    async function saveCustomTasks(newTasks) {
        showStatus('タスクを保存中...', 'warning');
        try {
            clientDetails.custom_tasks_by_year[currentYearSelection] = newTasks;
            propagateTasksToFutureYears(currentYearSelection, newTasks);
            await SupabaseAPI.updateClient(clientId, { custom_tasks_by_year: clientDetails.custom_tasks_by_year });
            showNotification('タスクが保存されました', 'success');
            return true;
        } catch (error) {
            showStatus(`❌ タスク保存エラー: ${handleSupabaseError(error)}`, 'error');
            return false;
        }
    }

    // --- Month Data Management ---
    function generateMonthsToDisplay(year) {
        if (!clientDetails.fiscal_month) return [];
        const fiscalMonth = clientDetails.fiscal_month;
        const months = [];
        for (let i = 0; i < 12; i++) {
            let month = fiscalMonth + i;
            let displayYear = parseInt(year);
            if (month > 12) {
                month -= 12;
                displayYear += 1;
            }
            months.push({ key: `${displayYear}-${String(month).padStart(2, '0')}`, display: `${displayYear}/${month}` });
        }
        return months;
    }

    async function getAllMonthlyTasks(months) {
        const tasks = {};
        const promises = months.map(async (month) => {
            tasks[month.key] = await SupabaseAPI.getMonthlyTasks(clientId, month.key) || { tasks: {}, url: '', memo: '' };
        });
        await Promise.all(promises);
        return tasks;
    }

    // --- UI Rendering ---
    async function renderAll() {
        if (!clientDetails) return;
        showLoading();
        await renderClientInfo();
        await renderYearFilter();
        monthsToDisplay = generateMonthsToDisplay(currentYearSelection);
        allTaskNames = getCurrentYearTasks();
        const allMonthData = await getAllMonthlyTasks(monthsToDisplay);
        
        renderDetailsTable(allMonthData);
        renderNotesTable(allMonthData);
        
        updateFinalizeButtonState();
        updateEditingInterface();
        hideLoading();
    }

    async function renderClientInfo() {
        const staffName = clientDetails.staffs?.name || '-';
        clientInfoArea.innerHTML = `
            <table class="client-info-table">
                <tr><th>事業所名</th><td>${clientDetails.name}</td><th>決算月</th><td>${clientDetails.fiscal_month}月</td></tr>
                <tr><th>担当者</th><td>${staffName}</td><th>会計方式</th><td>${clientDetails.accounting_method || '-'}</td></tr>
            </table>`;
    }

    async function renderYearFilter() {
        if (!yearFilter) return;
        const currentYear = new Date().getFullYear();
        let options = '';
        for (let year = currentYear - 5; year <= currentYear + 10; year++) {
            options += `<option value="${year}" ${year.toString() === currentYearSelection ? 'selected' : ''}>${year}年度</option>`;
        }
        yearFilter.innerHTML = options;
        const customTrigger = yearFilter.parentElement.querySelector('.custom-select-trigger');
        if (customTrigger) customTrigger.textContent = `${currentYearSelection}年度`;
    }

    function renderDetailsTable(allMonthData) {
        if (!detailsTableHead || !detailsTableBody) return;

        let headerHtml = '<tr><th>タスク</th>';
        monthsToDisplay.forEach(month => headerHtml += `<th>${month.display}</th>`);
        headerHtml += '<th>完了</th></tr>';
        detailsTableHead.innerHTML = headerHtml;

        let bodyHtml = '';
        if (allTaskNames.length === 0) {
            bodyHtml = '<tr><td colspan="14">タスクが設定されていません</td></tr>';
        } else {
            allTaskNames.forEach(taskName => {
                bodyHtml += `<tr><td><strong>${taskName}</strong></td>`;
                let completedCount = 0;
                monthsToDisplay.forEach(month => {
                    const isChecked = allMonthData[month.key]?.tasks?.[taskName] === true;
                    if (isChecked) completedCount++;
                    bodyHtml += `<td style="text-align: center;"><input type="checkbox" data-month="${month.key}" data-task="${taskName}" ${isChecked ? 'checked' : ''}></td>`;
                });
                const progressClass = completedCount === 12 ? 'progress-complete' : '';
                bodyHtml += `<td class="${progressClass}" style="text-align: center;">${completedCount}/12</td>`;
                bodyHtml += '</tr>';
            });
        }
        detailsTableBody.innerHTML = bodyHtml;
        addCheckboxEventListeners();
    }

    function renderNotesTable(allMonthData) {
        if (!notesTableHead || !notesTableBody) return;

        let headerHtml = '<tr><th>項目</th>';
        monthsToDisplay.forEach(month => headerHtml += `<th>${month.display}</th>`);
        notesTableHead.innerHTML = headerHtml;

        let urlRowHtml = '<tr><td><strong>URL</strong></td>';
        let memoRowHtml = '<tr><td><strong>メモ</strong></td>';

        monthsToDisplay.forEach(month => {
            const monthData = allMonthData[month.key];
            urlRowHtml += `<td><input type="text" data-month="${month.key}" data-field="url" value="${monthData?.url || ''}" placeholder="URL"></td>`;
            memoRowHtml += `<td><textarea data-month="${month.key}" data-field="memo" placeholder="メモ">${monthData?.memo || ''}</textarea></td>`;
        });

        notesTableBody.innerHTML = urlRowHtml + memoRowHtml;
        addNotesEventListeners();
    }

    // --- Event Listeners ---
    function addCheckboxEventListeners() {
        detailsTableBody.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                setUnsavedChanges(true);
                updateProgressDisplay();
            });
        });
    }

    function addNotesEventListeners() {
        notesTableBody.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => setUnsavedChanges(true));
        });
    }

    function updateProgressDisplay() {
        detailsTableBody.querySelectorAll('tr').forEach(row => {
            const checkboxes = row.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length === 0) return;
            const progressCell = row.querySelector('td:last-child');
            const completedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            progressCell.textContent = `${completedCount}/${checkboxes.length}`;
            progressCell.className = completedCount === checkboxes.length ? 'progress-complete' : '';
        });
    }

    // --- Task Edit Modal ---
    function openTaskEditModal() {
        taskListContainer.innerHTML = '';
        getCurrentYearTasks().forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `<input type="text" value="${task}" data-index="${index}"><button type="button" class="delete-task-button" data-index="${index}">削除</button>`;
            taskListContainer.appendChild(taskItem);
        });
        taskEditModal.style.display = 'block';
    }

    function closeTaskEditModal() {
        taskEditModal.style.display = 'none';
    }

    async function saveTaskChanges() {
        const newTasks = Array.from(taskListContainer.querySelectorAll('.task-item input')).map(input => input.value.trim()).filter(Boolean);
        if (await saveCustomTasks(newTasks)) {
            closeTaskEditModal();
            await renderAll();
        }
    }

    // --- Save All Changes ---
    async function saveAllChanges() {
        if (isSaving) return;
        isSaving = true;
        setUnsavedChanges(false);
        showStatus('保存中...', 'warning');

        try {
            const monthlyTasksToUpdate = {};

            detailsTableBody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const month = cb.dataset.month;
                const task = cb.dataset.task;
                if (!monthlyTasksToUpdate[month]) monthlyTasksToUpdate[month] = { tasks: {} };
                monthlyTasksToUpdate[month].tasks[task] = cb.checked;
            });

            notesTableBody.querySelectorAll('input, textarea').forEach(input => {
                const month = input.dataset.month;
                const field = input.dataset.field;
                if (!monthlyTasksToUpdate[month]) monthlyTasksToUpdate[month] = {};
                monthlyTasksToUpdate[month][field] = input.value;
            });

            const savePromises = Object.entries(monthlyTasksToUpdate).map(([month, data]) => 
                SupabaseAPI.upsertMonthlyTask(clientId, month, data)
            );

            await Promise.all(savePromises);
            showNotification('変更が保存されました', 'success');
        } catch (error) {
            showStatus(`❌ 保存エラー: ${handleSupabaseError(error)}`, 'error');
            setUnsavedChanges(true);
        } finally {
            isSaving = false;
            hideStatus();
        }
    }

    // --- Main Event Listeners ---
    function addMainEventListeners() {
        yearFilter.addEventListener('change', async () => {
            currentYearSelection = yearFilter.value;
            await renderAll();
        });

        editTasksButton.addEventListener('click', openTaskEditModal);
        saveChangesButton.addEventListener('click', saveAllChanges);
        finalizeYearButton.addEventListener('click', async () => {
            const isFinalized = clientDetails.finalized_years?.includes(currentYearSelection);
            if (confirm(`${currentYearSelection}年度を${isFinalized ? '確定解除' : '確定'}しますか？`)) {
                await finalizeYear(currentYearSelection, !isFinalized);
            }
        });

        // Task edit modal
        addTaskButton.addEventListener('click', () => {
            const newTaskName = newTaskInput.value.trim();
            if (!newTaskName) return;
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `<input type="text" value="${newTaskName}"><button type="button" class="delete-task-button">削除</button>`;
            taskListContainer.appendChild(taskItem);
            newTaskInput.value = '';
        });
        taskListContainer.addEventListener('click', e => {
            if (e.target.classList.contains('delete-task-button')) e.target.closest('.task-item').remove();
        });
        saveTasksButton.addEventListener('click', saveTaskChanges);
        cancelTasksButton.addEventListener('click', closeTaskEditModal);
        closeModalButton.addEventListener('click', closeTaskEditModal);
        window.addEventListener('click', e => { if (e.target === taskEditModal) closeTaskEditModal(); });

        // Unload warning
        window.addEventListener('beforeunload', e => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; } });
    }

    // --- Accordion Menu (Restored) ---
    function addManagementButtons() {
        const accordionContainer = document.createElement('div');
        accordionContainer.className = 'accordion-container';
        accordionContainer.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            width: 280px;
            z-index: 1000;
            border: 1px solid #ddd;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;

        const accordionHeader = document.createElement('button');
        accordionHeader.className = 'accordion-header';
        accordionHeader.innerHTML = `
            <span>⚙️ データ管理メニュー</span>
            <span class="accordion-icon">▼</span>
        `;
        accordionHeader.style.cssText = `
            width: 100%;
            padding: 12px 16px;
            background: #f8f9fa;
            border: none;
            text-align: left;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            font-weight: bold;
            color: #333;
            transition: background-color 0.2s;
        `;

        const accordionContent = document.createElement('div');
        accordionContent.className = 'accordion-content';
        accordionContent.style.cssText = `
            display: none;
            padding: 16px;
            background: #fff;
            border-top: 1px solid #ddd;
        `;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        const syncButton = document.createElement('button');
        syncButton.innerHTML = `<span>🔄</span> <span>データ整合性チェック (準備中)</span>`;
        syncButton.className = 'accordion-button';
        syncButton.disabled = true;
        syncButton.style.cssText = 'padding: 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; text-align: left; display: flex; align-items: center; gap: 8px;';

        const propagateButton = document.createElement('button');
        propagateButton.innerHTML = `<span>🚀</span> <span>タスクを将来年度に伝播 (準備中)</span>`;
        propagateButton.className = 'accordion-button';
        propagateButton.disabled = true;
        propagateButton.style.cssText = 'padding: 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; text-align: left; display: flex; align-items: center; gap: 8px;';

        const exportButton = document.createElement('button');
        exportButton.innerHTML = `<span>📄</span> <span>CSVエクスポート</span>`;
        exportButton.className = 'accordion-button export-button';
        exportButton.addEventListener('click', () => alert('CSVエクスポート機能は準備中です。'));
        exportButton.style.cssText = 'padding: 10px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;';

        let isOpen = false;
        accordionHeader.addEventListener('click', () => {
            isOpen = !isOpen;
            const icon = accordionHeader.querySelector('.accordion-icon');
            if (isOpen) {
                accordionContent.style.display = 'block';
                icon.textContent = '▲';
                accordionHeader.style.backgroundColor = '#e9ecef';
            } else {
                accordionContent.style.display = 'none';
                icon.textContent = '▼';
                accordionHeader.style.backgroundColor = '#f8f9fa';
            }
        });
        
        accordionHeader.addEventListener('mouseover', () => { if (!isOpen) accordionHeader.style.backgroundColor = '#e9ecef'; });
        accordionHeader.addEventListener('mouseout', () => { if (!isOpen) accordionHeader.style.backgroundColor = '#f8f9fa'; });

        buttonsContainer.appendChild(syncButton);
        buttonsContainer.appendChild(propagateButton);
        buttonsContainer.appendChild(exportButton);

        accordionContent.appendChild(buttonsContainer);
        accordionContainer.appendChild(accordionHeader);
        accordionContainer.appendChild(accordionContent);
        
        document.body.appendChild(accordionContainer);
    }

    // --- Initialization ---
    async function initialize() {
        showLoading();
        addMainEventListeners();
        try {
            await loadClientDetails();
            currentYearSelection = determineOptimalYear();
            await renderAll();
        } catch (error) {
            console.error('Fatal initialization error:', error);
            if (clientInfoArea) clientInfoArea.innerHTML = `<div class="error-message"><h3>初期化エラー</h3><p>${handleSupabaseError(error)}</p><button onclick="location.reload()">再読み込み</button></div>`;
        } finally {
            hideLoading();
        }
    }

    initialize().then(() => {
        addManagementButtons();
    });
});
