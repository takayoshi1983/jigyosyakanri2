import { SupabaseAPI, handleSupabaseError } from './supabase-client.js';

// フォントサイズ取得関数
function getCurrentFontSize() {
    const savedFontSize = localStorage.getItem('app-font-size');
    return savedFontSize ? parseInt(savedFontSize) : 100;
}

// 日本時間取得関数
function getJapanTime() {
    return new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString();
}

// URL自動リンク化機能
function autoLinkifyText(text) {
    const urlRegex = /(https?:\/\/[^\s\n]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" style="color: #007bff; text-decoration: underline; cursor: pointer;">$1</a>');
}

function createLinkedTextDisplay(textarea) {
    // 表示用のdivを作成
    const displayDiv = document.createElement('div');
    displayDiv.className = 'linked-text-display';
    displayDiv.style.cssText = `
        min-height: 165px;
        padding: 8px;
        border: 0px solid #ced4da;
        border-radius: 4px;
        background-color: #ffffff;
        font-family: inherit;
        font-size: inherit;
        line-height: 1;
        white-space: pre-wrap;
        word-wrap: break-word;
        cursor: text;
        color: #495057;
    `;
    
    // テキストエリアを一時的に非表示
    textarea.style.display = 'none';
    
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
    
    // テキストエリアからフォーカスが外れたら表示モードに戻る
    textarea.addEventListener('blur', () => {
        setTimeout(() => {
            displayDiv.style.display = 'block';
            textarea.style.display = 'none';
            updateDisplay();
        }, 100);
    });
    
    // テキスト変更時に表示を更新
    textarea.addEventListener('input', updateDisplay);
    
    // 初期表示
    updateDisplay();
    
    return displayDiv;
}

document.addEventListener('DOMContentLoaded', async () => {
    let orientationLocked = false;
    
    // Screen Orientation API サポートチェック
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
        console.log('📱 Screen Orientation API supported - using CSS rotation prompt only');
        
        // API は利用可能だが、デバイスでロックが失敗する場合が多いため
        // CSS による横画面推奨メッセージに依存する方針に変更
        console.log('Current orientation:', {
            type: screen.orientation.type,
            angle: screen.orientation.angle,
            width: window.innerWidth,
            height: window.innerWidth
        });
    } else {
        console.log('📱 Screen Orientation API not supported - using CSS rotation prompt');
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

    // --- Local Storage Helper Functions ---
    function loadPersonalSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('personalSettings') || '{}');
        console.log('[Details] Loading personal settings:', savedSettings);
        
        // デフォルト値
        const defaults = {
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            hideInactiveClients: false,
            enableConfettiEffect: false
        };
        
        // 既存の古い設定を移行（一度だけ）
        if (savedSettings.enableConfettiEffect === undefined && localStorage.getItem('enableConfettiEffect') !== null) {
            savedSettings.enableConfettiEffect = localStorage.getItem('enableConfettiEffect') === 'true';
            console.log('[Details] Migrated old confetti setting:', savedSettings.enableConfettiEffect);
        }
        
        const mergedSettings = { ...defaults, ...savedSettings };
        console.log('[Details] Final personal settings:', mergedSettings);
        return mergedSettings;
    }

    function getConfettiEffectSetting() {
        const personalSettings = loadPersonalSettings();
        console.log('[Details] Confetti effect setting:', personalSettings.enableConfettiEffect);
        return personalSettings.enableConfettiEffect;
    }

    // --- Utility Functions ---
    function isValidUrl(string) {
        // http:// または https:// で始まらない場合は無効とする
        if (!string.startsWith('http://') && !string.startsWith('https://')) {
            return false;
        }
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    function updateUrlInputStyle(input) {
        const button = input.nextElementSibling;
        if (isValidUrl(input.value)) {
            input.classList.add('url-like');
            button.style.display = 'inline-block';
        } else {
            input.classList.remove('url-like');
            button.style.display = 'none';
        }
    }

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
            editTasksButton.textContent = 'タスクの追加・編集';
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
            await SupabaseAPI.updateClient(clientId, { 
                custom_tasks_by_year: clientDetails.custom_tasks_by_year,
                updated_at: getJapanTime()
            });
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
        
        // テーブル幅に合わせて全体メモの幅を調整
        setTimeout(() => {
            adjustMemoWidth();
        }, 100);
    }

    async function renderClientInfo() {
        const staffName = clientDetails.staffs?.name || '-';
        
        // タイトル横に大きく事業者名を表示
        const clientNameDisplay = document.getElementById('client-name-display');
        if (clientNameDisplay) {
            clientNameDisplay.textContent = clientDetails.name;
        }
        
        clientInfoArea.innerHTML = `
            <table class="client-info-table">
                <tr><th>事業者ID</th><td>${clientDetails.id}</td><th>決算月</th><td>${clientDetails.fiscal_month}月</td></tr>
                <tr><th>担当者</th><td>${staffName}</td><th>会計方式</th><td>${clientDetails.accounting_method || '-'}</td></tr>
            </table>`;
        
        // 全体メモの読み込み
        loadOverallMemo();
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

    // 🎉 10種類の達成時エフェクト（Canvas Confetti + カスタムエフェクト）
    class ModernAchievementEffects {
        constructor() {
            this.effectOverlay = document.getElementById('achievement-effect-overlay');
            this.isAnimationReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            
            // モダンエフェクト配列（10種類）
            this.effects = [
                // Canvas Confetti エフェクト（既存を活用）
                this.triggerBasicConfetti.bind(this),
                this.triggerStarsEffect.bind(this),
                this.triggerEmojiEffect.bind(this),
                
                // 新しいモダンエフェクト（7種類追加）
                this.triggerHologramBurst.bind(this),
                this.triggerNeonRipple.bind(this),
                this.triggerParticleExplosion.bind(this),
                this.triggerFlipCard3D.bind(this),
                this.triggerMorphingShape.bind(this),
                this.triggerEnergyOrb.bind(this),
                this.triggerRainbowExplosion.bind(this)
            ];
            
            // パフォーマンス最適化のための要素プール
            this.elementPool = new Map();
            this.activeElements = new Set();
            
            // リサイズイベントでモバイル最適化
            this.handleResize = this.debounce(this.optimizeForViewport.bind(this), 250);
            window.addEventListener('resize', this.handleResize);
            
            // 初期化時にビューポート最適化
            this.optimizeForViewport();
        }

        // ランダムエフェクトを実行
        triggerRandomEffect() {
            if (!this.effectOverlay) {
                console.warn('エフェクトオーバーレイが見つかりません');
                return;
            }

            // アクセシビリティ: アニメーション軽減設定をチェック
            if (this.isAnimationReduced) {
                this.triggerSimpleEffect();
                return;
            }

            // パフォーマンス制御: 同時実行エフェクトを制限
            if (this.activeElements.size > 3) {
                this.cleanupOldEffects();
            }

            const randomIndex = Math.floor(Math.random() * this.effects.length);
            this.effects[randomIndex]();
            console.log(`🎉 モダン達成エフェクト実行: ${randomIndex + 1}番目`);
            return randomIndex;
        }

        // デバウンス関数（パフォーマンス最適化）
        debounce(func, wait) {
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

        // ビューポート最適化
        optimizeForViewport() {
            const isMobile = window.innerWidth < 768;
            const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
            
            this.viewportConfig = {
                isMobile,
                isTablet,
                isDesktop: !isMobile && !isTablet,
                particleCount: isMobile ? 30 : isTablet ? 50 : 80,
                animationDuration: isMobile ? 1.5 : 2.5
            };
        }

        // アクセシビリティ対応のシンプルエフェクト
        triggerSimpleEffect() {
            const message = document.createElement('div');
            message.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 2rem;
                font-weight: bold;
                color: #4caf50;
                z-index: 1001;
                pointer-events: none;
            `;
            message.textContent = '✅ 完了！';
            
            this.effectOverlay.appendChild(message);
            
            setTimeout(() => {
                if (message.parentNode) {
                    message.remove();
                }
            }, 1000);
        }

        // 古いエフェクト要素のクリーンアップ
        cleanupOldEffects() {
            this.activeElements.forEach(element => {
                if (element.parentNode) {
                    element.remove();
                }
            });
            this.activeElements.clear();
        }

        // エフェクト要素の追加（メモリ最適化付き）
        addEffectElement(element, duration = 3000) {
            this.effectOverlay.appendChild(element);
            this.activeElements.add(element);

            // GPU加速を明示的に有効化
            element.style.transform += ' translateZ(0)';
            
            // 自動クリーンアップ
            setTimeout(() => {
                if (element.parentNode) {
                    element.remove();
                }
                this.activeElements.delete(element);
            }, duration);

            return element;
        }

        // === Canvas Confetti エフェクト ===
        // 1. 基本的な紙吹雪エフェクト（モバイル最適化）
        triggerBasicConfetti() {
            if (typeof confetti !== 'undefined') {
                const config = this.viewportConfig;
                confetti({
                    particleCount: config.particleCount,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff9ff3'],
                    ticks: config.isMobile ? 100 : 200
                });
            }
        }

        // 2. 星のエフェクト（パフォーマンス最適化）
        triggerStarsEffect() {
            if (typeof confetti !== 'undefined') {
                const config = this.viewportConfig;
                const defaults = { 
                    startVelocity: config.isMobile ? 20 : 30, 
                    spread: 360, 
                    ticks: config.isMobile ? 80 : 120, 
                    zIndex: 1000 
                };
                
                confetti({
                    ...defaults,
                    particleCount: Math.floor(config.particleCount * 0.6),
                    scalar: config.isMobile ? 1.0 : 1.2,
                    shapes: ["star"],
                    colors: ['#ffdd59', '#ff6b6b', '#4ecdc4']
                });
                
                confetti({
                    ...defaults,
                    particleCount: Math.floor(config.particleCount * 0.3),
                    scalar: 0.75,
                    shapes: ["circle"],
                    colors: ['#fff', '#ffeb3b']
                });
            }
        }

        // 3. 絵文字エフェクト（達成感重視）
        triggerEmojiEffect() {
            if (typeof confetti !== 'undefined') {
                const config = this.viewportConfig;
                const scalar = config.isMobile ? 1.5 : 2;
                const achievementEmojis = ['🎉', '🏆', '⭐', '🎊', '✨', '🥇', '🎯', '💫'];
                
                confetti({
                    particleCount: Math.floor(config.particleCount * 0.8),
                    spread: config.isMobile ? 45 : 70,
                    origin: { y: 0.6 },
                    scalar: scalar,
                    shapes: achievementEmojis,
                    ticks: config.isMobile ? 100 : 150
                });
            }
        }

        // === 新しいモダンエフェクト ===
        // 4. ホログラム爆発エフェクト
        triggerHologramBurst() {
            const burst = document.createElement('div');
            burst.className = 'hologram-burst';
            this.addEffectElement(burst, 2500);
            
            // 追加のキラキラパーティクル
            this.createSparkleParticles(15, 2000);
        }

        // 5. ネオン波紋エフェクト
        triggerNeonRipple() {
            // メインの波紋を3つ生成
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const ripple = document.createElement('div');
                    ripple.className = 'neon-ripple';
                    this.addEffectElement(ripple, 3000);
                }, i * 400);
            }
            
            // 追加エフェクト用パーティクル
            this.createSparkleParticles(20, 2500);
        }

        // 6. パーティクル爆発エフェクト
        triggerParticleExplosion() {
            const config = this.viewportConfig;
            const particleCount = config.isMobile ? 40 : 80;
            const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff9ff3', '#a78bfa'];
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle-explosion';
                
                // ランダムな色と位置
                particle.style.background = colors[Math.floor(Math.random() * colors.length)];
                particle.style.left = '50%';
                particle.style.top = '50%';
                
                // 爆発方向の計算
                const angle = (Math.PI * 2 * i) / particleCount;
                const distance = Math.random() * 200 + 100;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                
                particle.style.setProperty('--dx', dx + 'px');
                particle.style.setProperty('--dy', dy + 'px');
                
                this.addEffectElement(particle, 2000);
            }
        }

        // 7. 3Dフリップカードエフェクト
        triggerFlipCard3D() {
            const card = document.createElement('div');
            card.className = 'flip-card-3d';
            
            const cardInner = document.createElement('div');
            cardInner.className = 'flip-card-inner';
            cardInner.textContent = '🏆';
            
            card.appendChild(cardInner);
            this.addEffectElement(card, 3000);
            
            // 周囲にキラキラ
            this.createSparkleParticles(12, 2500);
        }

        // 8. モーフィング図形エフェクト
        triggerMorphingShape() {
            const shape = document.createElement('div');
            shape.className = 'morphing-shape';
            this.addEffectElement(shape, 4000);
            
            // 補完的なパーティクル
            this.createSparkleParticles(18, 3500);
        }

        // 9. エネルギー球エフェクト
        triggerEnergyOrb() {
            const orb = document.createElement('div');
            orb.className = 'energy-orb';
            this.addEffectElement(orb, 2500);
            
            // エネルギー放電エフェクト
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    const spark = document.createElement('div');
                    spark.className = 'sparkle-particle';
                    spark.textContent = '⚡';
                    spark.style.left = (48 + Math.random() * 4) + '%';
                    spark.style.top = (48 + Math.random() * 4) + '%';
                    spark.style.fontSize = '24px';
                    spark.style.color = '#00bfff';
                    
                    this.addEffectElement(spark, 1500);
                }, i * 100);
            }
        }

        // 10. レインボー爆発エフェクト
        triggerRainbowExplosion() {
            const explosion = document.createElement('div');
            explosion.className = 'rainbow-explosion';
            this.addEffectElement(explosion, 3000);
            
            // 追加のレインボーパーティクル
            const rainbowColors = ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff'];
            
            for (let i = 0; i < 16; i++) {
                setTimeout(() => {
                    const particle = document.createElement('div');
                    particle.className = 'sparkle-particle';
                    particle.textContent = '●';
                    particle.style.left = (45 + Math.random() * 10) + '%';
                    particle.style.top = (45 + Math.random() * 10) + '%';
                    particle.style.color = rainbowColors[i % rainbowColors.length];
                    particle.style.fontSize = '16px';
                    
                    this.addEffectElement(particle, 1500);
                }, i * 50);
            }
        }

        // ヘルパー関数：キラキラパーティクル生成
        createSparkleParticles(count, duration) {
            const sparkles = ['✨', '⭐', '💫', '🌟', '✧', '☆'];
            const config = this.viewportConfig;
            const actualCount = config.isMobile ? Math.floor(count * 0.6) : count;
            
            for (let i = 0; i < actualCount; i++) {
                setTimeout(() => {
                    const sparkle = document.createElement('div');
                    sparkle.className = 'sparkle-particle';
                    sparkle.textContent = sparkles[Math.floor(Math.random() * sparkles.length)];
                    sparkle.style.left = Math.random() * 100 + '%';
                    sparkle.style.top = Math.random() * 100 + '%';
                    sparkle.style.fontSize = (Math.random() * 10 + 15) + 'px';
                    sparkle.style.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
                    
                    this.addEffectElement(sparkle, 1500);
                }, i * (duration / actualCount));
            }
        }

        // デストラクタ（リソースクリーンアップ）
        destroy() {
            window.removeEventListener('resize', this.handleResize);
            this.cleanupOldEffects();
            this.elementPool.clear();
        }

    }

    // グローバルインスタンス作成
    let modernAchievementEffects = null;
    
    function triggerConfetti() {
        // 設定をチェックしてエフェクトを制御
        if (!getConfettiEffectSetting()) {
            return; // エフェクトが無効な場合は何もしない
        }
        
        // 初回時にインスタンス作成
        if (!modernAchievementEffects) {
            modernAchievementEffects = new ModernAchievementEffects();
        }
        
        // 10種類のモダンエフェクトからランダムに実行
        modernAchievementEffects.triggerRandomEffect();
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
            const urlValue = monthData?.url || '';
            urlRowHtml += `<td>
                <input type="text" data-month="${month.key}" data-field="url" value="${urlValue}" placeholder="">
                <button type="button" class="url-jump-button" title="URLを開く">🚀</button>
            </td>`;
            memoRowHtml += `<td><textarea data-month="${month.key}" data-field="memo" placeholder="">${monthData?.memo || ''}</textarea></td>`;
        });

        notesTableBody.innerHTML = urlRowHtml + memoRowHtml;
        addNotesEventListeners();
        
        // 月次メモ欄にURL自動リンク化を適用
        setTimeout(() => {
            const memoTextareas = document.querySelectorAll('#notes-table textarea[data-field="memo"]');
            memoTextareas.forEach(textarea => {
                if (!textarea.parentNode.querySelector('.linked-text-display')) {
                    createLinkedTextDisplay(textarea);
                }
            });
        }, 100);
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

        // 全体メモ欄の変更検知を追加
        const generalMemoField = document.getElementById('general-memo');
        if (generalMemoField) {
            generalMemoField.addEventListener('input', (e) => {
                setUnsavedChanges(true);
            });
        }
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
        notesTableBody.addEventListener('input', (e) => {
            setUnsavedChanges(true);
            // URL入力欄の場合、スタイルを更新
            if (e.target.dataset.field === 'url') {
                updateUrlInputStyle(e.target);
            }
        });

        notesTableBody.addEventListener('click', (e) => {
            // ジャンプボタンのクリック処理
            if (e.target.classList.contains('url-jump-button')) {
                e.preventDefault();
                const input = e.target.previousElementSibling;
                const url = input.value;
                if (isValidUrl(url)) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            }
        });

        // 初期表示のために全URL入力をチェック
        notesTableBody.querySelectorAll('input[data-field="url"]').forEach(updateUrlInputStyle);
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

            // メモデータの保存ロジックを修正
            const memoInputs = detailsTableBody.querySelectorAll('.checkbox-memo-input');
            memoInputs.forEach(memoInput => {
                const month = memoInput.dataset.month;
                const task = memoInput.dataset.task;
                const memoValue = memoInput.value; // trim() しないで生の値を扱う

                // 月のオブジェクトがなければ初期化
                if (!monthlyTasksToUpdate[month]) {
                    monthlyTasksToUpdate[month] = { tasks: {}, task_memos: {} };
                } else if (!monthlyTasksToUpdate[month].task_memos) {
                    monthlyTasksToUpdate[month].task_memos = {};
                }
                
                // メモの値を常にセットする（空の場合も上書きのため）
                monthlyTasksToUpdate[month].task_memos[task] = memoValue;
            });

            notesTableBody.querySelectorAll('input, textarea').forEach(input => {
                const month = input.dataset.month;
                const field = input.dataset.field;
                if (!monthlyTasksToUpdate[month]) monthlyTasksToUpdate[month] = {};
                monthlyTasksToUpdate[month][field] = input.value;
            });

            // upsert前に、空のメモをクリーンアップする
            Object.values(monthlyTasksToUpdate).forEach(monthData => {
                if (monthData.task_memos) {
                    for (const task in monthData.task_memos) {
                        if (monthData.task_memos[task] === null || monthData.task_memos[task].trim() === '') {
                            delete monthData.task_memos[task];
                        }
                    }
                }
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

            // クライアントの最終更新時刻を更新（日本時間）
            await SupabaseAPI.updateClient(clientId, {
                updated_at: getJapanTime()
            });

            // 全体メモの保存
            await saveOverallMemo();

            // 紙吹雪は個別のチェックボックス操作でのみ発生、保存時には発生しない

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

    // 全体メモ保存処理
    async function saveOverallMemo() {
        const generalMemoField = document.getElementById('general-memo');
        if (generalMemoField && clientId) {
            const memoValue = generalMemoField.value.trim();
            await SupabaseAPI.updateClient(clientId, { 
                overall_memo: memoValue,
                updated_at: getJapanTime()
            });
            console.log('[Details] Overall memo saved:', memoValue);
        }
    }

    // 全体メモ読み込み処理
    function loadOverallMemo() {
        const generalMemoField = document.getElementById('general-memo');
        if (generalMemoField && clientDetails) {
            const memoValue = clientDetails.overall_memo || '';
            generalMemoField.value = memoValue;
            console.log('[Details] Overall memo loaded:', memoValue);
        }
    }

    // --- Main Event Listeners ---
    function addMainEventListeners() {
        // 分析機能ボタン
        const analyticsButton = document.getElementById('analytics-button');
        if (analyticsButton) {
            analyticsButton.addEventListener('click', () => {
                // 分析画面に戻ることをフラグ設定
                sessionStorage.setItem('returnFromDetails', 'true');
                window.location.href = 'analytics.html';
            });
        }

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
            const checkToast = toast.loading('データ整合性をチェック中...');
            
            // 1. フロントエンドの現在状態を収集
            const frontendState = collectFrontendState();
            
            // 2. DBの状態を取得
            const dbState = await SupabaseAPI.getMonthlyTasksState(clientId, year);
            
            // 3. 詳細な比較実行
            const comparisonResult = compareStates(frontendState, dbState, year);
            
            toast.hide(checkToast);
            
            // 4. 結果を表示
            displayDetailedConsistencyResult(comparisonResult);
            
        } catch (error) {
            console.error('Consistency check error:', error);
            toast.error(`整合性チェックエラー: ${handleSupabaseError(error)}`);
        }
    }

    // フロントエンドの現在状態を収集
    function collectFrontendState() {
        const state = {};
        
        // 全てのチェックボックスの状態を収集
        const checkboxes = document.querySelectorAll('#details-table input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const month = checkbox.dataset.month;
            const task = checkbox.dataset.task;
            
            if (!state[month]) state[month] = { tasks: {}, memos: {} };
            state[month].tasks[task] = checkbox.checked;
        });
        
        // 全てのメモの内容を収集
        const memoInputs = document.querySelectorAll('.checkbox-memo-input');
        memoInputs.forEach(memoInput => {
            const month = memoInput.dataset.month;
            const task = memoInput.dataset.task;
            
            if (!state[month]) state[month] = { tasks: {}, memos: {} };
            state[month].memos[task] = memoInput.value || '';
        });
        
        console.log('Frontend state collected:', state);
        return state;
    }

    // フロントエンドとDBの状態を詳細比較
    function compareStates(frontendState, dbState, year) {
        const issues = [];
        const matches = [];
        const stats = {
            totalChecked: 0,
            consistentItems: 0,
            inconsistentItems: 0,
            missingInDb: 0,
            missingInFrontend: 0
        };

        // 全ての月とタスクの組み合わせをチェック
        const allMonths = new Set([...Object.keys(frontendState), ...Object.keys(dbState)]);
        
        allMonths.forEach(month => {
            const frontMonth = frontendState[month] || { tasks: {}, memos: {} };
            const dbMonth = dbState[month] || { tasks: {}, task_memos: {} };
            
            // タスクの比較
            const allTasks = new Set([
                ...Object.keys(frontMonth.tasks),
                ...Object.keys(dbMonth.tasks || {})
            ]);
            
            allTasks.forEach(task => {
                stats.totalChecked++;
                
                const frontendChecked = frontMonth.tasks[task];
                const dbChecked = (dbMonth.tasks || {})[task];
                const frontendMemo = frontMonth.memos[task] || '';
                const dbMemo = (dbMonth.task_memos || {})[task] || '';
                
                // チェックボックス状態の比較（より正確な判定）
                const frontendBool = Boolean(frontendChecked);
                const dbBool = Boolean(dbChecked);
                
                if (frontendBool !== dbBool) {
                    // 画面でtrueなのにDBでfalse/undefined、またはその逆の場合のみ不整合と判定
                    if ((frontendChecked === true && !dbChecked) || (!frontendChecked && dbChecked === true)) {
                        stats.inconsistentItems++;
                        issues.push({
                            type: 'checkbox_mismatch',
                            severity: 'error',
                            month: month,
                            task: task,
                            frontend: frontendChecked,
                            database: dbChecked,
                            message: `${month} "${task}": チェック状態不一致 (画面:${frontendChecked} ≠ DB:${dbChecked || 'データなし'})`
                        });
                    } else {
                        // false vs undefined は一致と見なす
                        stats.consistentItems++;
                        matches.push({
                            month: month,
                            task: task,
                            type: 'checkbox',
                            status: 'consistent'
                        });
                    }
                } else {
                    stats.consistentItems++;
                    matches.push({
                        month: month,
                        task: task,
                        type: 'checkbox',
                        status: 'consistent'
                    });
                }
                
                // メモ内容の比較
                if (frontendMemo !== dbMemo) {
                    stats.inconsistentItems++;
                    issues.push({
                        type: 'memo_mismatch',
                        severity: 'warning',
                        month: month,
                        task: task,
                        frontend: frontendMemo,
                        database: dbMemo,
                        message: `${month} "${task}": メモ内容不一致`
                    });
                } else if (frontendMemo || dbMemo) {
                    matches.push({
                        month: month,
                        task: task,
                        type: 'memo',
                        status: 'consistent'
                    });
                }
            });
        });

        const isConsistent = issues.length === 0;
        
        return {
            is_consistent: isConsistent,
            issues: issues,
            matches: matches,
            stats: stats,
            client_name: clientDetails?.name || 'Unknown',
            year: year,
            summary: {
                total_issues: issues.length,
                critical_issues: issues.filter(i => i.severity === 'error').length,
                warnings: issues.filter(i => i.severity === 'warning').length,
                consistent_items: stats.consistentItems
            }
        };
    }

    // 詳細な整合性チェック結果の表示
    function displayDetailedConsistencyResult(result) {
        const { is_consistent, issues, matches, stats, client_name, year, summary } = result;
        
        // モーダルを作成
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 10000; display: flex;
            justify-content: center; align-items: center; padding: 20px;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white; border-radius: 8px; padding: 20px; 
            max-width: 90vw; max-height: 90vh; overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        const title = document.createElement('h2');
        title.style.cssText = 'margin-top: 0; display: flex; justify-content: space-between; align-items: center;';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: #6c757d; color: white; border: none; 
            border-radius: 50%; width: 30px; height: 30px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
        `;
        
        closeBtn.addEventListener('click', () => modal.remove());
        
        if (is_consistent) {
            title.innerHTML = '✅ データ整合性チェック結果';
            title.style.color = '#28a745';
            title.appendChild(closeBtn);
            
            modalContent.innerHTML = `
                <h2 style="color: #28a745; margin-top: 0;">✅ データ整合性チェック結果</h2>
                <div style="text-align: center; padding: 20px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; margin: 20px 0;">
                    <h3 style="color: #155724; margin-top: 0;">🎉 完全に一致しています！</h3>
                    <p style="color: #155724; margin-bottom: 0;">
                        <strong>${client_name}</strong>（${year}年度）<br>
                        画面の表示とデータベースが完全に一致しています。
                    </p>
                </div>
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                    <h4 style="margin-top: 0;">統計情報</h4>
                    <ul style="margin: 0;">
                        <li>チェック済み項目: <strong>${stats.totalChecked}件</strong></li>
                        <li>一致項目: <strong>${stats.consistentItems}件</strong></li>
                        <li>一致データ: <strong>${matches.length}個</strong></li>
                    </ul>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button id="close-consistency-modal" style="
                        background: #28a745; color: white; border: none; 
                        padding: 12px 24px; border-radius: 6px; cursor: pointer; 
                        font-size: 16px; font-weight: 500;
                    ">✅ 完了</button>
                </div>
            `;
        } else {
            title.innerHTML = '⚠️ データ整合性チェック結果';
            title.style.color = '#dc3545';
            title.appendChild(closeBtn);
            
            let contentHtml = `
                <h2 style="color: #dc3545; margin-top: 0;">⚠️ データ整合性チェック結果</h2>
                <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 15px; margin: 20px 0;">
                    <h3 style="color: #721c24; margin-top: 0;">不整合が検出されました</h3>
                    <p><strong>クライアント:</strong> ${client_name} (${year}年度)</p>
                    <p><strong>不整合総数:</strong> ${summary.total_issues}件 (重要: ${summary.critical_issues}件, 軽微: ${summary.warnings}件)</p>
                    <p><strong>一致項目:</strong> ${summary.consistent_items}件</p>
                </div>
            `;
            
            if (issues.length > 0) {
                contentHtml += '<div style="margin: 20px 0;"><h4>検出された問題:</h4>';
                
                issues.forEach((issue, index) => {
                    const severityColor = issue.severity === 'error' ? '#dc3545' : '#ffc107';
                    const severityIcon = issue.severity === 'error' ? '❌' : '⚠️';
                    const bgColor = issue.severity === 'error' ? '#f8d7da' : '#fff3cd';
                    
                    contentHtml += `
                        <div style="border-left: 4px solid ${severityColor}; padding: 12px; margin: 10px 0; background: ${bgColor}; border-radius: 4px;">
                            <h5 style="margin: 0 0 8px 0; color: ${severityColor};">${severityIcon} ${issue.message}</h5>
                            <div style="font-size: 14px; color: #6c757d;">
                                <strong>画面表示:</strong> "${issue.frontend}" → <strong>データベース:</strong> "${issue.database}"
                            </div>
                        </div>
                    `;
                });
                
                contentHtml += '</div>';
                
                // 自動修復ボタンを追加
                contentHtml += `
                    <div style="margin: 20px 0; padding: 15px; background: #e2e3e5; border-radius: 6px; text-align: center;">
                        <h4 style="margin-top: 0;">自動修復</h4>
                        <p>データベースを画面の状態に合わせて修正しますか？</p>
                        <button id="auto-fix-btn" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px;">
                            🔧 DBを画面に合わせて修復
                        </button>
                        <button id="refresh-frontend-btn" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px;">
                            🔄 画面をDBに合わせて更新
                        </button>
                    </div>
                `;
            }
            
            // 完了ボタンを追加
            contentHtml += `
                <div style="text-align: center; margin-top: 20px; border-top: 1px solid #dee2e6; padding-top: 15px;">
                    <button id="close-consistency-modal" style="
                        background: #6c757d; color: white; border: none; 
                        padding: 12px 24px; border-radius: 6px; cursor: pointer; 
                        font-size: 16px; font-weight: 500;
                    ">完了</button>
                </div>
            `;
            
            modalContent.innerHTML = contentHtml;
            
            // 自動修復ボタンのイベントリスナー
            setTimeout(() => {
                const autoFixBtn = modalContent.querySelector('#auto-fix-btn');
                const refreshBtn = modalContent.querySelector('#refresh-frontend-btn');
                
                if (autoFixBtn) {
                    autoFixBtn.addEventListener('click', async () => {
                        modal.remove();
                        await fixDatabaseToMatchFrontend();
                    });
                }
                
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', async () => {
                        modal.remove();
                        await refreshFrontendFromDatabase();
                    });
                }
            }, 100);
        }
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // 完了ボタンのイベントリスナー
        setTimeout(() => {
            const closeModalBtn = modalContent.querySelector('#close-consistency-modal');
            if (closeModalBtn) {
                closeModalBtn.addEventListener('click', () => modal.remove());
            }
        }, 100);
        
        // ESCキーで閉じる
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // DBを画面の状態に合わせて修復
    async function fixDatabaseToMatchFrontend() {
        const fixToast = toast.loading('データベースを修復中...');
        
        try {
            const frontendState = collectFrontendState();
            
            // フロントエンドの状態をDBに保存
            for (const month of Object.keys(frontendState)) {
                const monthData = frontendState[month];
                
                // 月次タスクを更新
                await SupabaseAPI.updateMonthlyTasksByMonth(clientId, month, {
                    tasks: monthData.tasks,
                    task_memos: monthData.memos
                });
            }
            
            // クライアントの最終更新時刻を更新
            await SupabaseAPI.updateClient(clientId, {
                updated_at: getJapanTime()
            });
            
            toast.update(fixToast, 'データベースの修復が完了しました', 'success');
            
        } catch (error) {
            console.error('Database fix error:', error);
            toast.update(fixToast, `修復エラー: ${handleSupabaseError(error)}`, 'error');
        }
    }

    // 画面をDBの状態に合わせて更新
    async function refreshFrontendFromDatabase() {
        const refreshToast = toast.loading('画面を更新中...');
        
        try {
            // 画面を再読み込みして最新のDB状態を反映
            await renderAll();
            
            toast.update(refreshToast, '画面の更新が完了しました', 'success');
            
        } catch (error) {
            console.error('Frontend refresh error:', error);
            toast.update(refreshToast, `更新エラー: ${handleSupabaseError(error)}`, 'error');
        }
    }

    // 整合性チェック結果の表示（旧版 - 互換性のため残す）
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
            
            // 自動修復ボタンを追加
            if (summary.critical_issues > 0 || summary.warnings > 0) {
                issueHtml += `
                    <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                        <button id="auto-repair-btn" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">
                            🔧 自動修復を実行
                        </button>
                        <p style="font-size: 12px; color: #666; margin-top: 10px;">
                            進捗状態の不整合や廃止されたタスクの削除を自動で修復します
                        </p>
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
        
        // 自動修復ボタンのイベントハンドラー
        const autoRepairBtn = modalContent.querySelector('#auto-repair-btn');
        if (autoRepairBtn) {
            autoRepairBtn.addEventListener('click', async () => {
                try {
                    autoRepairBtn.disabled = true;
                    autoRepairBtn.innerHTML = '🔧 修復中...';
                    autoRepairBtn.style.background = '#6c757d';
                    
                    const result = await SupabaseAPI.fixDataConsistency(clientId, currentYearSelection || new Date().getFullYear());
                    
                    if (result.success) {
                        toast.success(result.message);
                        
                        // 修復結果をモーダルに表示
                        const fixResultHtml = `
                            <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 15px; margin: 15px 0;">
                                <h4 style="color: #155724; margin-top: 0;">✅ 修復完了！</h4>
                                <p style="color: #155724; margin-bottom: 10px;">${result.message}</p>
                                ${result.fixes.length > 0 ? `
                                    <details style="color: #155724; margin-top: 10px;">
                                        <summary style="cursor: pointer; font-weight: bold;">修復内容の詳細</summary>
                                        <ul style="margin-top: 10px;">
                                            ${result.fixes.map(fix => `<li>${fix.message}</li>`).join('')}
                                        </ul>
                                    </details>
                                ` : ''}
                            </div>
                        `;
                        
                        // 自動修復ボタンを成功状態に更新
                        autoRepairBtn.outerHTML = `
                            <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                                ${fixResultHtml}
                                <button style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;" onclick="location.reload()">
                                    🔄 データを再読み込み
                                </button>
                            </div>
                        `;
                    } else {
                        toast.error('修復に失敗しました');
                        autoRepairBtn.disabled = false;
                        autoRepairBtn.innerHTML = '🔧 自動修復を実行';
                        autoRepairBtn.style.background = '#28a745';
                    }
                } catch (error) {
                    console.error('Auto repair error:', error);
                    toast.error(`修復エラー: ${error.message}`);
                    autoRepairBtn.disabled = false;
                    autoRepairBtn.innerHTML = '🔧 自動修復を実行';
                    autoRepairBtn.style.background = '#28a745';
                }
            });
        }
        
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
        syncButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #17a3b8a4; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';
        
        syncButton.addEventListener('click', async () => {
            await performDataConsistencyCheck();
        });

        const propagateButton = document.createElement('button');
        propagateButton.innerHTML = `<span>🚀</span> <span>タスクを将来年度に伝播 (準備中)</span>`;
        propagateButton.className = 'accordion-button';
        propagateButton.disabled = true;
        propagateButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #a19d9d79; border: 1px solid #ccc; border-radius: 4px; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';

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
        finalizeYearButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #28a746b0; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';
        
        const exportButton = document.createElement('button');
        exportButton.innerHTML = `<span>📄</span> <span>CSVエクスポート</span>`;
        exportButton.className = 'accordion-button export-button';
        exportButton.addEventListener('click', () => alert('CSVエクスポート機能は準備中です。'));
        exportButton.style.cssText = 'margin: 0; padding: 10px 16px; background: #a19d9d79; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;';

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
        
        // スクロールモードボタンをアコーディオン作成後に追加
        setTimeout(() => {
            if (typeof toggleDetailsScrollMode !== 'undefined') {
                addDetailsTableModeToggle(toggleDetailsScrollMode);
            }
        }, 500); // 少し長めの遅延で確実に関数が定義されるまで待機
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
            // URL自動リンク化を初期化
            initializeAutoLinkify();
        }
    }

    // URL自動リンク化初期化
    function initializeAutoLinkify() {
        // 全体メモ欄
        const generalMemo = document.getElementById('general-memo');
        if (generalMemo) {
            createLinkedTextDisplay(generalMemo);
        }

        // 月次メモ欄（動的に生成されるため、定期的にチェック）
        setTimeout(() => {
            const memoTextareas = document.querySelectorAll('#notes-table textarea[data-field="memo"]');
            memoTextareas.forEach(textarea => {
                if (!textarea.parentNode.querySelector('.linked-text-display')) {
                    createLinkedTextDisplay(textarea);
                }
            });
        }, 1000);
    }


    // レスポンシブ詳細テーブル幅調整機能
    function initResponsiveDetailsTable() {
        let resizeTimeout;
        
        // ローカルストレージから設定を読み込み
        function getStoredDetailsTableMode() {
            return localStorage.getItem('detailsTableDisplayMode') || 'fit';
        }
        
        // ローカルストレージに設定を保存
        function setStoredDetailsTableMode(mode) {
            localStorage.setItem('detailsTableDisplayMode', mode);
        }
        
        function adjustDetailsTableLayout() {
            const detailsWrapper = document.querySelector('.details-table-wrapper');
            const detailsTable = document.querySelector('.details-table');
            const notesTable = document.getElementById('notes-table');
            
            if (!detailsWrapper || !detailsTable) return;
            
            // 保存された設定を確認
            const savedMode = getStoredDetailsTableMode();
            if (savedMode === 'scroll') {
                // スクロールモードが保存されている場合はスキップ
                return;
            }
            
            const containerWidth = detailsWrapper.offsetWidth;
            
            // フィットモードの場合のみ横スクロールを無効化
            detailsWrapper.style.overflowX = 'visible';
            
            // ウィンドウ幅に基づくフォントサイズ調整（ユーザー設定を考慮）
            const userFontSize = getCurrentFontSize() / 100; // パーセンテージを倍率に変換
            if (containerWidth < 800) {
                detailsTable.style.fontSize = `${10 * userFontSize}px`;
                if (notesTable) notesTable.style.fontSize = `${10 * userFontSize}px`;
                adjustDetailsColumnWidths('compact');
            } else if (containerWidth < 1200) {
                detailsTable.style.fontSize = `${11 * userFontSize}px`;
                if (notesTable) notesTable.style.fontSize = `${11 * userFontSize}px`;
                adjustDetailsColumnWidths('medium');
            } else {
                detailsTable.style.fontSize = `${13 * userFontSize}px`;
                if (notesTable) notesTable.style.fontSize = `${12 * userFontSize}px`;
                adjustDetailsColumnWidths('standard');
            }
        }
        
        function adjustDetailsColumnWidths(mode) {
            const detailsTable = document.querySelector('.details-table');
            const notesTable = document.getElementById('notes-table');
            if (!detailsTable) return;
            
            // 固定幅で統一（CSSと連動）
            const firstColWidth = mode === 'compact' ? '80px' : mode === 'medium' ? '100px' : '120px';
            const monthColWidth = mode === 'compact' ? '60px' : mode === 'medium' ? '80px' : '100px';
            
            // タスクテーブルの項目名列の幅を設定
            const detailsFirstCells = detailsTable.querySelectorAll('td:first-child, th:first-child');
            detailsFirstCells.forEach(cell => {
                cell.style.width = firstColWidth;
                cell.style.minWidth = firstColWidth;
                cell.style.maxWidth = firstColWidth;
            });
            
            // タスクテーブルの月次列の幅を設定
            const detailsMonthCells = detailsTable.querySelectorAll('th.month-header, td:not(:first-child)');
            detailsMonthCells.forEach(cell => {
                if (!cell.classList.contains('sticky-col')) {
                    cell.style.width = monthColWidth;
                    cell.style.minWidth = monthColWidth;
                    cell.style.maxWidth = monthColWidth;
                    cell.style.textAlign = 'center';
                }
            });
            
            // URL・メモテーブルも同じ幅に統一
            if (notesTable) {
                const notesFirstCells = notesTable.querySelectorAll('td:first-child, th:first-child');
                notesFirstCells.forEach(cell => {
                    cell.style.width = firstColWidth;
                    cell.style.minWidth = firstColWidth;
                    cell.style.maxWidth = firstColWidth;
                });
                
                const notesMonthCells = notesTable.querySelectorAll('th:not(:first-child), td:not(:first-child)');
                notesMonthCells.forEach(cell => {
                    cell.style.width = monthColWidth;
                    cell.style.minWidth = monthColWidth;
                    cell.style.maxWidth = monthColWidth;
                    cell.style.textAlign = 'center';
                });
            }
        }
        
        function toggleDetailsScrollMode() {
            const detailsWrapper = document.querySelector('.details-table-wrapper');
            const detailsTable = document.querySelector('.details-table');
            const notesTable = document.getElementById('notes-table');
            
            if (!detailsWrapper || !detailsTable) return;
            
            const currentMode = getStoredDetailsTableMode();
            let newMode, newModeText;
            
            if (currentMode === 'fit') {
                // フィットモード→スクロールモードに切り替え
                detailsWrapper.style.overflowX = 'auto';
                const userFontSize = getCurrentFontSize() / 100;
                detailsTable.style.fontSize = `${13 * userFontSize}px`;
                if (notesTable) notesTable.style.fontSize = `${12 * userFontSize}px`;
                
                // 元の幅に戻す
                const allDetailsCells = detailsTable.querySelectorAll('th, td');
                allDetailsCells.forEach(cell => {
                    cell.style.width = '';
                    cell.style.minWidth = '';
                    cell.style.maxWidth = '';
                });
                
                if (notesTable) {
                    const allNotesCells = notesTable.querySelectorAll('th, td');
                    allNotesCells.forEach(cell => {
                        cell.style.width = '';
                        cell.style.minWidth = '';
                        cell.style.maxWidth = '';
                    });
                }
                
                newMode = 'scroll';
                newModeText = 'スクロールモード';
            } else {
                // スクロールモード→フィットモードに切り替え
                detailsWrapper.style.overflowX = 'visible';
                adjustDetailsTableLayout();
                newMode = 'fit';
                newModeText = 'フィットモード';
            }
            
            // 設定をローカルストレージに保存
            setStoredDetailsTableMode(newMode);
            
            // ボタンテキストを更新
            updateDetailsToggleButtonText(newMode);
            
            return newModeText;
        }
        
        // 保存された設定に基づいて初期モードを適用
        function applyStoredDetailsTableMode() {
            const savedMode = getStoredDetailsTableMode();
            const detailsWrapper = document.querySelector('.details-table-wrapper');
            const detailsTable = document.querySelector('.details-table');
            const notesTable = document.getElementById('notes-table');
            
            if (!detailsWrapper || !detailsTable) return;
            
            if (savedMode === 'scroll') {
                // スクロールモードを適用
                detailsWrapper.style.overflowX = 'auto';
                const userFontSize = getCurrentFontSize() / 100;
                detailsTable.style.fontSize = `${13 * userFontSize}px`;
                if (notesTable) notesTable.style.fontSize = `${12 * userFontSize}px`;
                
                const allDetailsCells = detailsTable.querySelectorAll('th, td');
                allDetailsCells.forEach(cell => {
                    cell.style.width = '';
                    cell.style.minWidth = '';
                    cell.style.maxWidth = '';
                });
                
                if (notesTable) {
                    const allNotesCells = notesTable.querySelectorAll('th, td');
                    allNotesCells.forEach(cell => {
                        cell.style.width = '';
                        cell.style.minWidth = '';
                        cell.style.maxWidth = '';
                    });
                }
            } else {
                // フィットモードを適用（デフォルト）
                adjustDetailsTableLayout();
            }
        }
        
        // ウィンドウリサイズイベント
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                adjustDetailsTableLayout();
                adjustMemoWidth(); // リサイズ時にメモ幅も調整
            }, 150);
        });
        
        // 初期調整と保存された設定の適用
        setTimeout(() => {
            applyStoredDetailsTableMode();
            adjustDetailsTableLayout();
            adjustMemoWidth(); // メモ幅も初期調整
        }, 1000);
    }
    
    // 詳細画面ボタンテキストを更新する関数
    function updateDetailsToggleButtonText(mode) {
        const toggleButton = document.querySelector('#details-table-mode-toggle-btn');
        if (!toggleButton) return;
        
        if (mode === 'fit') {
            toggleButton.innerHTML = '📏 フィットモード <small>(→スクロール)</small>';
        } else {
            toggleButton.innerHTML = '📏 スクロールモード <small>(→フィット)</small>';
        }
    }
    
    // 全体メモの幅をテーブル幅に合わせる関数
    function adjustMemoWidth() {
        const detailsTable = document.querySelector('#details-table');
        const memoSection = document.querySelector('.memo-section');
        const memoTextarea = document.querySelector('#general-memo');
        
        if (detailsTable && memoSection && memoTextarea) {
            // テーブルの実際の幅を取得
            const tableWidth = detailsTable.offsetWidth;
            
            // メモセクション全体とテキストエリアの幅を調整
            memoSection.style.width = `${tableWidth}px`;
            memoSection.style.maxWidth = `${tableWidth}px`;
        }
    }
    
    function addDetailsTableModeToggle(toggleFunction) {
        const accordionContent = document.querySelector('#data-management-accordion .accordion-content');
        if (!accordionContent) return;
        
        const toggleButton = document.createElement('button');
        toggleButton.id = 'details-table-mode-toggle-btn';
        toggleButton.className = 'btn';
        toggleButton.style.cssText = `
            width: 100% !important;
            margin: 5px 0;
            text-align: center;
            padding: 10px 15px !important;
            min-height: 40px !important;
            background: linear-gradient(135deg, #4CAF50, #45a049) !important;
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
        
        // 初期ボタンテキスト設定
        const savedMode = localStorage.getItem('detailsTableDisplayMode') || 'fit';
        // ボタンが作成されてから確実にテキストを設定
        setTimeout(() => {
            updateDetailsToggleButtonText(savedMode);
        }, 100);
        
        toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            const newModeText = toggleFunction();
            
            // トースト通知で状態を表示
            if (window.showToast) {
                window.showToast(`詳細テーブル: ${newModeText}に切り替えました`, 'info', 2000);
            } else if (toast && toast.info) {
                toast.info(`詳細テーブル: ${newModeText}に切り替えました`);
            }
        });
        
        // アコーディオン内の最後に追加
        accordionContent.appendChild(toggleButton);
    }

    // モバイルデバイス判定関数
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || (window.innerWidth <= 480 && 'ontouchstart' in window);
    }

    // PC環境では横向きメッセージを非表示にする
    function hideRotateMessageOnDesktop() {
        if (!isMobileDevice()) {
            // CSSスタイルを動的に追加
            const style = document.createElement('style');
            style.textContent = `
                .rotate-message {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                }
            `;
            document.head.appendChild(style);
            
            // DOM要素も削除
            const rotateMessage = document.querySelector('.rotate-message');
            if (rotateMessage) {
                rotateMessage.remove();
                console.log('PC環境のため横向きメッセージを削除しました');
            } else {
                console.log('横向きメッセージ要素が見つかりません');
            }
        }
    }

    // 初期化処理（DOMが完全に読み込まれてから実行）
    setTimeout(() => {
        hideRotateMessageOnDesktop();
    }, 100);
    initialize();
    
    // レスポンシブ詳細テーブル機能を初期化
    setTimeout(() => {
        initResponsiveDetailsTable();
    }, 2000);
});
