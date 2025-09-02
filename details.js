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
    // finalizeYearButton は動的に作成されるため、ここでは取得しない
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
        const finalizeYearButton = document.getElementById('finalize-year-button');
        if (!finalizeYearButton) {
            console.log('finalize-year-button not found, skipping update');
            return;
        }
        
        if (!clientDetails) {
            console.log('clientDetails not available, skipping update');
            return;
        }
        
        const isYearFinalized = clientDetails.finalized_years?.includes(currentYearSelection);
        const buttonText = isYearFinalized ? `${currentYearSelection}年度の確定を解除` : `${currentYearSelection}年度のタスクを確定`;
        const buttonColor = isYearFinalized ? '#FF5722' : '#4CAF50';
        
        // Update button content
        const spanElement = finalizeYearButton.querySelector('span:nth-child(2)');
        if (spanElement) {
            spanElement.textContent = buttonText;
        } else {
            finalizeYearButton.innerHTML = `<span>📋</span> <span>${buttonText}</span>`;
        }
        
        finalizeYearButton.style.backgroundColor = buttonColor;
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
    function generateMonthsToDisplay(fiscalYear) {
        if (!clientDetails || !clientDetails.fiscal_month) return [];
        
        const fiscalClosingMonth = clientDetails.fiscal_month;
        const startMonth = fiscalClosingMonth + 1;

        const months = [];
        for (let i = 0; i < 12; i++) {
            let currentMonth = startMonth + i;
            let currentYear = parseInt(fiscalYear);

            if (currentMonth > 12) {
                currentMonth -= 12;
                currentYear += 1;
            }

            months.push({ 
                key: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
                display: `${currentYear}/${currentMonth}` 
            });
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
        
        // selectのoptionを更新
        let options = '';
        for (let year = 2024; year <= 2050; year++) {
            options += `<option value="${year}" ${year.toString() === currentYearSelection ? 'selected' : ''}>${year}年度</option>`;
        }
        yearFilter.innerHTML = options;
        
        // カスタムドロップダウンのUIを手動で更新
        const wrapper = yearFilter.parentElement;
        if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
            const customTrigger = wrapper.querySelector('.custom-select-trigger');
            const customOptions = wrapper.querySelector('.custom-options');
            
            // トリガーのテキスト更新
            if (customTrigger) {
                customTrigger.textContent = `${currentYearSelection}年度`;
            }
            
            // カスタムオプションを再生成
            if (customOptions) {
                customOptions.innerHTML = '';
                for (let year = 2024; year <= 2050; year++) {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'custom-option';
                    optionDiv.textContent = `${year}年度`;
                    optionDiv.setAttribute('data-value', year.toString());
                    
                    // 現在選択中の年度にはselectedクラスを追加
                    if (year.toString() === currentYearSelection) {
                        optionDiv.classList.add('selected');
                    }
                    
                    // オプションクリック時の処理
                    optionDiv.addEventListener('click', () => {
                        // 既存の選択を解除
                        customOptions.querySelectorAll('.custom-option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        
                        // 新しい選択を設定
                        optionDiv.classList.add('selected');
                        customTrigger.textContent = optionDiv.textContent;
                        yearFilter.value = optionDiv.getAttribute('data-value');
                        customOptions.style.display = 'none';
                        
                        // changeイベントを発火
                        const changeEvent = new Event('change', { bubbles: true });
                        yearFilter.dispatchEvent(changeEvent);
                    });
                    
                    customOptions.appendChild(optionDiv);
                }
                customOptions.style.display = 'none';
            }
            
            // トリガークリックイベントの設定
            if (customTrigger) {
                // 既存のイベントリスナーをクリア
                const newTrigger = customTrigger.cloneNode(true);
                customTrigger.parentNode.replaceChild(newTrigger, customTrigger);
                
                newTrigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const isVisible = customOptions.style.display === 'block';
                    
                    // 他のドロップダウンを閉じる
                    document.querySelectorAll('.custom-options').forEach(opts => {
                        opts.style.display = 'none';
                    });
                    
                    // 現在のドロップダウンを開く/閉じる
                    customOptions.style.display = isVisible ? 'none' : 'block';
                });
            }
        }
        
        // ドキュメントクリックで閉じる処理
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                const customOptions = wrapper.querySelector('.custom-options');
                if (customOptions) {
                    customOptions.style.display = 'none';
                }
            }
        });
    }

    function renderDetailsTable(allMonthData) {
        if (!detailsTableHead || !detailsTableBody) return;

        let headerHtml = '<tr><th>タスク</th>';
        monthsToDisplay.forEach(month => {
            headerHtml += `<th class="month-header clickable" data-month="${month.key}" style="cursor: pointer; user-select: none;">${month.display}</th>`;
        });
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
                    // task_memosフィールドが存在しない場合の安全な取得
                    const taskMemo = (allMonthData[month.key]?.task_memos && allMonthData[month.key].task_memos[taskName]) || '';
                    if (isChecked) completedCount++;
                    bodyHtml += `<td class="checkbox-memo-cell" data-month="${month.key}" data-task="${taskName}">
                        <div class="checkbox-memo-container">
                            <input type="checkbox" data-month="${month.key}" data-task="${taskName}" ${isChecked ? 'checked' : ''}>
                            <input type="text" class="checkbox-memo-input" data-month="${month.key}" data-task="${taskName}" placeholder="メモ" value="${taskMemo}">
                        </div>
                    </td>`;
                });
                const progressClass = completedCount === 12 ? 'progress-complete' : '';
                bodyHtml += `<td class="${progressClass}" style="text-align: center;">${completedCount}/12</td>`;
                bodyHtml += '</tr>';
            });
        }
        detailsTableBody.innerHTML = bodyHtml;
        addCheckboxEventListeners();
        addMonthHeaderEventListeners();
    }

    // --- Month Header Click Event Listeners ---
    function addMonthHeaderEventListeners() {
        detailsTableHead.querySelectorAll('.month-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const monthKey = e.target.getAttribute('data-month');
                toggleMonthColumn(monthKey);
            });
        });
    }

    function toggleMonthColumn(monthKey) {
        const checkboxes = detailsTableBody.querySelectorAll(`input[type="checkbox"][data-month="${monthKey}"]`);
        if (checkboxes.length === 0) return;

        // 現在の状態を確認（全てチェック済みか）
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        // 全選択または全解除
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        // 未保存状態に設定
        setUnsavedChanges(true);
        
        // 進捗表示を更新
        updateProgressDisplay();

        // 全列の完了状況をチェックして紙吹雪を判定
        checkForConfetti(monthKey, !allChecked);
    }

    function checkForConfetti(monthKey, isAllChecked) {
        if (!isAllChecked) return; // 全解除の場合は紙吹雪なし

        // この月のすべてのタスクがチェックされているかを確認
        const monthCheckboxes = detailsTableBody.querySelectorAll(`input[type="checkbox"][data-month="${monthKey}"]`);
        const allTasksCompleted = Array.from(monthCheckboxes).every(cb => cb.checked);

        if (allTasksCompleted && monthCheckboxes.length > 0) {
            // 紙吹雪エフェクトを発動
            triggerConfetti();
        }
    }

    function triggerConfetti() {
        // Basic Cannon エフェクト
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
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
            checkbox.addEventListener('change', (e) => {
                setUnsavedChanges(true);
                updateProgressDisplay();
                
                // チェックが入った場合、その月の完了状況をチェック
                if (e.target.checked) {
                    const monthKey = e.target.getAttribute('data-month');
                    checkForIndividualConfetti(monthKey);
                }
            });
        });

        // メモ入力欄のイベントリスナーを追加
        detailsTableBody.querySelectorAll('.checkbox-memo-input').forEach(memoInput => {
            memoInput.addEventListener('input', (e) => {
                setUnsavedChanges(true);
            });
        });
    }

    function checkForIndividualConfetti(monthKey) {
        // この月のすべてのタスクがチェックされているかを確認
        const monthCheckboxes = detailsTableBody.querySelectorAll(`input[type="checkbox"][data-month="${monthKey}"]`);
        const allTasksCompleted = Array.from(monthCheckboxes).every(cb => cb.checked);

        if (allTasksCompleted && monthCheckboxes.length > 0) {
            // 紙吹雪エフェクトを発動
            triggerConfetti();
        }
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

            // メモデータの保存（task_memosカラムが存在する場合のみ）
            const memoInputs = detailsTableBody.querySelectorAll('.checkbox-memo-input');
            if (memoInputs.length > 0) {
                // まずtask_memosフィールドが使用可能かテスト保存
                try {
                    memoInputs.forEach(memoInput => {
                        const month = memoInput.dataset.month;
                        const task = memoInput.dataset.task;
                        const memoValue = memoInput.value.trim();
                        
                        if (!monthlyTasksToUpdate[month]) monthlyTasksToUpdate[month] = { tasks: {} };
                        
                        // メモが入力されている場合のみtask_memosフィールドを追加
                        if (memoValue) {
                            if (!monthlyTasksToUpdate[month].task_memos) monthlyTasksToUpdate[month].task_memos = {};
                            monthlyTasksToUpdate[month].task_memos[task] = memoValue;
                        }
                    });
                } catch (error) {
                    console.warn('Memo saving skipped - task_memos field may not exist:', error);
                }
            }

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
        // 年度変更イベントを委譲で処理
        document.addEventListener('change', async (e) => {
            if (e.target && e.target.id === 'year-filter') {
                // 未保存の変更があるかチェック
                if (hasUnsavedChanges) {
                    const confirmChange = confirm(
                        '⚠️ 未保存の変更があります\n\n' +
                        '年度を変更すると、現在の変更内容が失われます。\n' +
                        '「変更を保存」ボタンを押してから年度を変更することをお勧めします。\n\n' +
                        'それでも年度を変更しますか？'
                    );
                    
                    if (!confirmChange) {
                        // ユーザーがキャンセルした場合、ドロップダウンを元に戻す
                        e.target.value = currentYearSelection;
                        
                        // カスタムドロップダウンの表示も元に戻す
                        const wrapper = e.target.parentElement;
                        const customTrigger = wrapper.querySelector('.custom-select-trigger');
                        if (customTrigger) {
                            customTrigger.textContent = `${currentYearSelection}年度`;
                        }
                        
                        // 保存ボタンにフォーカスして注意を促す
                        if (saveChangesButton && !saveChangesButton.disabled) {
                            saveChangesButton.style.animation = 'pulse 2s infinite';
                            saveChangesButton.focus();
                            
                            setTimeout(() => {
                                saveChangesButton.style.animation = '';
                            }, 4000);
                        }
                        
                        return;
                    }
                    
                    // ユーザーが続行を選択した場合、未保存状態をリセット
                    setUnsavedChanges(false);
                }
                
                currentYearSelection = e.target.value;
                await renderAll();
            }
        });

        editTasksButton.addEventListener('click', openTaskEditModal);
        if (saveChangesButton) {
            saveChangesButton.addEventListener('click', saveAllChanges);
        }
        // finalizeYearButton のイベントリスナーは addManagementButtons() で動的に追加

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

        const finalizeYearButton = document.createElement('button');
        finalizeYearButton.innerHTML = `<span>📋</span> <span>この年度の項目を確定</span>`;
        finalizeYearButton.className = 'accordion-button finalize-year-button';
        finalizeYearButton.id = 'finalize-year-button';
        finalizeYearButton.addEventListener('click', async () => {
            const isFinalized = clientDetails.finalized_years?.includes(currentYearSelection);
            if (confirm(`${currentYearSelection}年度を${isFinalized ? '確定解除' : '確定'}しますか？`)) {
                await finalizeYear(currentYearSelection, !isFinalized);
            }
        });
        finalizeYearButton.style.cssText = 'padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;';
        
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

        buttonsContainer.appendChild(finalizeYearButton);
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
        
        // アコーディオンメニューを最初に作成
        addManagementButtons();
        
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

    initialize();
});
