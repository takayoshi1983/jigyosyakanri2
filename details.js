import { SupabaseAPI, handleSupabaseError } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    // スマホでの横画面推奨 (Screen Orientation API対応ブラウザのみ)
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
        try {
            // 横画面に強制 (Android Chromeなどで動作)
            await screen.orientation.lock('landscape');
        } catch (error) {
            console.log('Screen orientation lock not supported or denied:', error);
            // 横画面推奨メッセージを表示する方法に フォールバック
        }
    }
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
        const loadToast = toast.loading('クライアントデータを読み込み中...');
        try {
            // キャッシュされたクライアントデータを優先使用
            const cachedClient = sessionStorage.getItem('cached_client_data');
            if (cachedClient) {
                const parsedClient = JSON.parse(cachedClient);
                if (parsedClient.id == clientId) {
                    clientDetails = parsedClient;
                } else {
                    clientDetails = await SupabaseAPI.getClient(clientId);
                }
                // キャッシュデータをクリア
                sessionStorage.removeItem('cached_client_data');
            } else {
                clientDetails = await SupabaseAPI.getClient(clientId);
            }
            
            if (!clientDetails) throw new Error('クライアントが見つかりません');

            clientDetails.custom_tasks_by_year = clientDetails.custom_tasks_by_year || {};
            clientDetails.finalized_years = clientDetails.finalized_years || [];

            await checkAndSetupInitialTasks();
            toast.update(loadToast, 'データ読み込み完了', 'success');
        } catch (error) {
            console.error('Error loading client details:', error);
            toast.hide(loadToast);
            toast.error(`データ読み込みエラー: ${handleSupabaseError(error)}`);
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
        const finalizeToast = toast.loading('年度確定処理中...');
        try {
            clientDetails.finalized_years = clientDetails.finalized_years || [];
            if (shouldFinalize) {
                if (!clientDetails.finalized_years.includes(year)) clientDetails.finalized_years.push(year);
            } else {
                clientDetails.finalized_years = clientDetails.finalized_years.filter(y => y !== year);
            }
            await SupabaseAPI.updateClient(clientId, { finalized_years: clientDetails.finalized_years });
            const action = shouldFinalize ? '確定' : '確定解除';
            toast.update(finalizeToast, `${year}年度を${action}しました`, 'success');
            showNotification(`${year}年度を${action}しました`, 'success');
            updateFinalizeButtonState();
            updateEditingInterface();
        } catch (error) {
            toast.error(`年度確定エラー: ${handleSupabaseError(error)}`);
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
        const isInactive = clientDetails.status === 'inactive' || clientDetails.status === 'deleted';
        
        isEditingMode = !isYearFinalized && !isInactive;
        editTasksButton.disabled = isYearFinalized || isInactive;
        
        if (isInactive) {
            editTasksButton.textContent = '関与終了 (閲覧のみ)';
        } else if (isYearFinalized) {
            editTasksButton.textContent = '確定済み (編集不可)';
        } else {
            editTasksButton.textContent = 'タスクの編集';
        }
        
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
        const saveTaskToast = toast.loading('タスクを保存中...');
        try {
            clientDetails.custom_tasks_by_year[currentYearSelection] = newTasks;
            propagateTasksToFutureYears(currentYearSelection, newTasks);
            await SupabaseAPI.updateClient(clientId, { custom_tasks_by_year: clientDetails.custom_tasks_by_year });
            toast.update(saveTaskToast, 'タスクが保存されました', 'success');
            showNotification('タスクが保存されました', 'success');
            return true;
        } catch (error) {
            toast.hide(saveTaskToast);
            toast.error(`タスク保存エラー: ${handleSupabaseError(error)}`);
            return false;
        }
    }

    // --- Month Data Management ---
    function generateMonthsToDisplay(fiscalYear) {
        if (!clientDetails || !clientDetails.fiscal_month) return [];
        
        const fiscalClosingMonth = clientDetails.fiscal_month;
        const selectedYear = parseInt(fiscalYear);

        const months = [];
        
        // 決算月の翌月から開始し、12ヶ月表示（決算月で終了）
        for (let i = 0; i < 12; i++) {
            let monthOffset = i + 1;  // 1から12まで
            let currentMonth = fiscalClosingMonth + monthOffset;
            let currentYear = selectedYear - 1;  // 前年から開始
            
            // 13以上になったら翌年に
            if (currentMonth > 12) {
                currentMonth -= 12;
                currentYear = selectedYear;  // 選択年に
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
                    const checkedClass = isChecked ? ' checked' : '';
                    bodyHtml += `<td class="checkbox-memo-cell${checkedClass}" data-month="${month.key}" data-task="${taskName}">
                        <div class="checkbox-memo-container">
                            <input type="checkbox" data-month="${month.key}" data-task="${taskName}" ${isChecked ? 'checked' : ''}>
                            <textarea class="checkbox-memo-input" data-month="${month.key}" data-task="${taskName}" placeholder="">${taskMemo}</textarea>
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
            
            // セルの背景色も更新
            const cell = checkbox.closest('.checkbox-memo-cell');
            if (cell) {
                if (!allChecked) {
                    cell.classList.add('checked');
                } else {
                    cell.classList.remove('checked');
                }
            }
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
            urlRowHtml += `<td><input type="text" data-month="${month.key}" data-field="url" value="${monthData?.url || ''}" placeholder=""></td>`;
            memoRowHtml += `<td><textarea data-month="${month.key}" data-field="memo" placeholder="">${monthData?.memo || ''}</textarea></td>`;
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
                
                // セルの背景色を更新
                const cell = e.target.closest('.checkbox-memo-cell');
                if (cell) {
                    if (e.target.checked) {
                        cell.classList.add('checked');
                    } else {
                        cell.classList.remove('checked');
                    }
                }
                
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
        const saveToast = toast.loading('保存中...');

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

            // 各月のタスク完了状態を判定し、`completed`フラグを設定
            const currentTasksForYear = getCurrentYearTasks();
            Object.keys(monthlyTasksToUpdate).forEach(month => {
                const updatedTasks = monthlyTasksToUpdate[month].tasks || {};
                const allTasksCompleted = currentTasksForYear.every(taskName => updatedTasks[taskName] === true);
                monthlyTasksToUpdate[month].completed = allTasksCompleted;
            });

            const savePromises = Object.entries(monthlyTasksToUpdate).map(([month, data]) => 
                SupabaseAPI.upsertMonthlyTask(clientId, month, data)
            );

            const updatedResults = await Promise.all(savePromises);

            // 完了になった月に紙吹雪を飛ばす
            updatedResults.forEach(result => {
                if (result.completed) {
                    // 以前の状態と比較して、今回初めて完了になった場合のみ飛ばすのが理想だが、
                    // ここでは簡略化し、完了状態で保存された場合は常に飛ばす
                    triggerConfetti();
                }
            });

            toast.update(saveToast, '変更が保存されました', 'success');
            showNotification('変更が保存されました', 'success');
        } catch (error) {
            toast.hide(saveToast);
            toast.error(`保存エラー: ${handleSupabaseError(error)}`);
            setUnsavedChanges(true);
        } finally {
            isSaving = false;
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
        
        // ズームスライダー機能
        if (zoomSlider && zoomValue && mainContainer) {
            zoomSlider.addEventListener('input', (e) => {
                const zoomLevel = e.target.value;
                const scale = zoomLevel / 100;
                zoomValue.textContent = zoomLevel + '%';
                
                // スケール変換を適用（幅は固定）
                mainContainer.style.transform = `scale(${scale})`;
                mainContainer.style.transformOrigin = 'top left';
                mainContainer.style.width = `${100 / scale}vw`;
            });
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

    // データ整合性チェック機能
    async function performDataConsistencyCheck() {
        if (!clientId) {
            toast.error('クライアントIDが不明です');
            return;
        }

        const year = currentYearSelection || new Date().getFullYear();
        
        try {
            // Loading状態の表示
            toast.info('データ整合性をチェック中...');
            
            // API呼び出し
            const result = await SupabaseAPI.checkDataConsistency(clientId, year);
            
            if (result.success) {
                displayConsistencyCheckResult(result);
            } else {
                toast.error('整合性チェックに失敗しました');
            }
            
        } catch (error) {
            console.error('Consistency check error:', error);
            toast.error(`整合性チェックエラー: ${handleSupabaseError(error)}`);
        }
    }

    // 整合性チェック結果の表示
    function displayConsistencyCheckResult(result) {
        const { is_consistent, issues, stats, summary } = result;
        
        // モーダルまたは専用エリアに結果を表示
        const resultModal = createConsistencyResultModal(result);
        document.body.appendChild(resultModal);
        resultModal.style.display = 'block';
    }

    // 結果表示モーダルの作成
    function createConsistencyResultModal(result) {
        const { is_consistent, issues, stats, summary, client_name, year } = result;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'display: none; position: fixed; z-index: 2000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5);';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.cssText = 'background-color: #fefefe; margin: 5% auto; padding: 20px; border-radius: 8px; width: 80%; max-width: 600px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
        
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px;';
        
        const title = document.createElement('h2');
        title.style.cssText = 'margin: 0; color: #333;';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; color: #999;';
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });
        
        if (is_consistent) {
            title.innerHTML = '✅ データ整合性チェック結果';
            title.style.color = '#28a745';
            modalContent.innerHTML += `
                <div style="text-align: center; padding: 20px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; margin: 20px 0;">
                    <h3 style="color: #155724; margin-top: 0;">🎉 すべて正常です！</h3>
                    <p style="color: #155724; margin-bottom: 0;">
                        <strong>${client_name}</strong>（${year}年度）のデータに問題はありません。
                    </p>
                </div>
            `;
        } else {
            title.innerHTML = '⚠️ データ整合性チェック結果';
            title.style.color = '#dc3545';
            
            let issueHtml = `
                <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 15px; margin: 20px 0;">
                    <h3 style="color: #721c24; margin-top: 0;">検出された問題</h3>
                    <p><strong>クライアント:</strong> ${client_name} (${year}年度)</p>
                    <p><strong>問題総数:</strong> ${summary.total_issues}件 (エラー: ${summary.critical_issues}件, 警告: ${summary.warnings}件)</p>
                </div>
                <div style="margin: 20px 0;">
            `;
            
            issues.forEach(issue => {
                const severityColor = issue.severity === 'error' ? '#dc3545' : '#ffc107';
                const severityIcon = issue.severity === 'error' ? '❌' : '⚠️';
                
                issueHtml += `
                    <div style="border-left: 4px solid ${severityColor}; padding: 10px 15px; margin: 10px 0; background: #f8f9fa;">
                        <h4 style="margin: 0 0 5px 0; color: ${severityColor};">${severityIcon} ${issue.message}</h4>
                        <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 14px;">
                            種類: ${issue.type} | 重要度: ${issue.severity}
                        </p>
                    </div>
                `;
            });
            
            issueHtml += `</div>`;
            
            // 自動修復ボタンを追加（将来の機能拡張用）
            if (summary.critical_issues > 0 || summary.warnings > 0) {
                issueHtml += `
                    <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                        <button id="auto-repair-btn" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">
                            🔧 自動修復を実行 (準備中)
                        </button>
                    </div>
                `;
            }
            
            modalContent.innerHTML += issueHtml;
        }
        
        // 統計情報を追加
        const statsHtml = `
            <div style="background: #e9ecef; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #495057;">📊 データ統計</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                    <div><strong>タスク項目数:</strong> ${stats.total_tasks}個</div>
                    <div><strong>月次データ:</strong> ${stats.total_months}ヶ月分</div>
                    <div><strong>欠落月:</strong> ${stats.missing_months.length}ヶ月</div>
                    <div><strong>不整合タスク:</strong> ${stats.inconsistent_tasks.length}件</div>
                </div>
            </div>
        `;
        modalContent.innerHTML += statsHtml;
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        modalContent.insertBefore(header, modalContent.firstChild);
        
        modal.appendChild(modalContent);
        
        // ESCキーでモーダルを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.parentNode) {
                modal.remove();
            }
        });
        
        // モーダル外クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        return modal;
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
        syncButton.innerHTML = `<span>🔄</span> <span>データ整合性チェック</span>`;
        syncButton.className = 'accordion-button';
        syncButton.disabled = false;
        syncButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';
        
        syncButton.addEventListener('click', async () => {
            await performDataConsistencyCheck();
        });

        const propagateButton = document.createElement('button');
        propagateButton.innerHTML = `<span>🚀</span> <span>タスクを将来年度に伝播 (準備中)</span>`;
        propagateButton.className = 'accordion-button';
        propagateButton.disabled = true;
        propagateButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';

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
        finalizeYearButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';
        
        const exportButton = document.createElement('button');
        exportButton.innerHTML = `<span>📄</span> <span>CSVエクスポート</span>`;
        exportButton.className = 'accordion-button export-button';
        exportButton.addEventListener('click', () => alert('CSVエクスポート機能は準備中です。'));
        exportButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';

        // editTasksButton をアコーディオンメニューに追加
        const editTasksButtonInAccordion = document.getElementById('edit-tasks-button');
        if (editTasksButtonInAccordion) {
            // スタイルをアコーディオンボタンに合わせる
            editTasksButtonInAccordion.className = 'accordion-button';
            editTasksButtonInAccordion.innerHTML = `<span>✏️</span> <span>${editTasksButtonInAccordion.textContent}</span>`;
            editTasksButtonInAccordion.style.cssText = 'margin: 0; padding: 10px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';
            
            buttonsContainer.prepend(editTasksButtonInAccordion); // 一番上に追加
        }

        let isOpen = false;
        accordionHeader.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent immediate closing by document click
            isOpen = !isOpen;
            const icon = accordionHeader.querySelector('.accordion-icon');
            if (isOpen) {
                accordionContent.style.display = 'block';
                icon.textContent = '▲';
                accordionHeader.style.backgroundColor = '#e9ecef';
                document.addEventListener('click', closeAccordionOnClickOutside);
            } else {
                accordionContent.style.display = 'none';
                icon.textContent = '▼';
                accordionHeader.style.backgroundColor = '#f8f9fa';
                document.removeEventListener('click', closeAccordionOnClickOutside);
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

        function closeAccordionOnClickOutside(event) {
            if (!accordionContainer.contains(event.target)) {
                accordionContent.style.display = 'none';
                const icon = accordionHeader.querySelector('.accordion-icon');
                if (icon) {
                    icon.textContent = '▼';
                }
                accordionHeader.style.backgroundColor = '#f8f9fa';
                isOpen = false;
                document.removeEventListener('click', closeAccordionOnClickOutside);
            }
        }
        
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
            toast.error(`初期化エラー: ${handleSupabaseError(error)}`);
            if (clientInfoArea) clientInfoArea.innerHTML = `<div class="error-message"><h3>初期化エラー</h3><p>${handleSupabaseError(error)}</p><button onclick="location.reload()">再読み込み</button></div>`;
        } finally {
            hideLoading();
        }
    }


    initialize();
});
