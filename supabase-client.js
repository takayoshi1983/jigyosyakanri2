// Supabase クライアント設定
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Vercel環境変数から設定を取得（フォールバックあり）
const getSupabaseConfig = () => {
  // Vercelランタイムでは window.location を使用して環境変数を注入する仕組みを使用
  const config = window.SUPABASE_CONFIG || {
    url: 'https://jhjexgkzzbzxhhlezaoa.supabase.co',
    
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoamV4Z2t6emJ6eGhobGV6YW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDUyMzAsImV4cCI6MjA3MjIyMTIzMH0.So1WcCBUEV-mMQu6_k-xRdNn3XDLwGxcCzDT3L402EQ'
  };
  return config;
};

const { url, anonKey } = getSupabaseConfig();

// Supabaseクライアント初期化
export const supabase = createClient(url, anonKey);

// API操作用のヘルパー関数
export class SupabaseAPI {
    
    // クライアント関連
    static async getClients() {
        const { data, error } = await supabase
            .from('clients')
            .select(`
                *,
                staffs(name)
            `)
            .order('id');
            
        if (error) throw error;
        return data;
    }
    
    static async getClient(id) {
        const { data, error } = await supabase
            .from('clients')
            .select(`
                *,
                staffs(name)
            `)
            .eq('id', id)
            .single();
            
        if (error) throw error;
        return data;
    }
    
    static async createClient(clientData) {
        const { data, error } = await supabase
            .from('clients')
            .insert(clientData)
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
    
    static async updateClient(id, clientData) {
        const { data, error } = await supabase
            .from('clients')
            .update(clientData)
            .eq('id', id)
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
    
    static async deleteClient(id) {
        const { error } = await supabase
            .from('clients')
            .update({ status: 'deleted' })
            .eq('id', id);
            
        if (error) throw error;
    }
    
    static async restoreClient(id) {
        const { error } = await supabase
            .from('clients')
            .update({ status: 'active' })
            .eq('id', id);
            
        if (error) throw error;
    }

    static async permanentlyDeleteClient(id) {
        // 関連データも含めて物理削除
        // 1. 月次タスクデータを削除
        const { error: monthlyTasksError } = await supabase
            .from('monthly_tasks')
            .delete()
            .eq('client_id', id);
        
        if (monthlyTasksError) throw monthlyTasksError;
        
        // 2. 編集セッションを削除
        const { error: sessionsError } = await supabase
            .from('editing_sessions')
            .delete()
            .eq('client_id', id);
        
        if (sessionsError) throw sessionsError;
        
        // 3. クライアントデータを削除
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
    }
    
    // スタッフ関連
    static async getStaffs() {
        const { data, error } = await supabase
            .from('staffs')
            .select('*')
            .order('id');
            
        if (error) throw error;
        return data;
    }

    static async createStaffs(staffsData) {
        const { data, error } = await supabase
            .from('staffs')
            .insert(staffsData)
            .select();

        if (error) throw error;
        return data;
    }

    static async updateStaffs(staffsData) {
        const { data, error } = await supabase
            .from('staffs')
            .upsert(staffsData)
            .select();

        if (error) throw error;
        return data;
    }

    static async deleteStaffs(staffIds) {
        // Check if any of the staff to be deleted are assigned to clients
        const { data: assigned, error: checkError } = await supabase
            .from('clients')
            .select('name, staffs(name)')
            .in('staff_id', staffIds)
            .eq('status', 'active');

        if (checkError) throw checkError;

        if (assigned && assigned.length > 0) {
            const assignments = assigned.map(a => `  - ${a.staffs.name} (担当: ${a.name})`).join('\n');
            const error = new Error(`以下の担当者はクライアントに割り当てられているため削除できません:\n${assignments}`);
            error.name = 'StaffAssignedError';
            throw error;
        }

        const { error } = await supabase
            .from('staffs')
            .delete()
            .in('id', staffIds);

        if (error) throw error;
    }
    
    // 下位互換性のために単数形の関数も残しておく
    static async createStaff(staffData) {
        return this.createStaffs([staffData]);
    }

    static async updateStaff(id, staffData) {
        return this.updateStaffs([{ ...staffData, id }]);
    }

    static async deleteStaff(id) {
        return this.deleteStaffs([id]);
    }
    
    static async getClientsAssignedToStaff(staffId) {
        const { data, error } = await supabase
            .from('clients')
            .select('id, name')
            .eq('staff_id', staffId)
            .eq('status', 'active');
            
        if (error) throw error;
        return data || [];
    }
    
    // 月次タスク関連
    static async getMonthlyTasks(clientId = null, month = null) {
        try {
            let query = supabase.from('monthly_tasks').select('*');

            // パラメータが指定された場合のみフィルタリング
            if (clientId !== null && month !== null) {
                query = query.eq('client_id', clientId).eq('month', month);
                const { data, error } = await query.maybeSingle();
                if (error) {
                    console.warn(`Monthly task not found for client ${clientId}, month ${month}:`, error);
                    return null;
                }
                return data;
            } else {
                // 全件取得（analytics用）- ページネーションで確実に全件取得

                // まず総件数を確認
                const { count, error: countError } = await supabase
                    .from('monthly_tasks')
                    .select('*', { count: 'exact', head: true });

                if (countError) {
                    console.error('件数取得エラー:', countError);
                } else {
                    console.log(`📊 総データ件数: ${count}件`);
                }

                let allData = [];
                let from = 0;
                const batchSize = 1000;

                while (true) {
                    console.log(`📊 バッチ取得中: range(${from}, ${from + batchSize - 1})`);
                    const { data, error } = await supabase
                        .from('monthly_tasks')
                        .select('*')
                        .order('client_id', { ascending: true })
                        .order('month', { ascending: false })
                        .order('completed', { ascending: false })
                        .order('id', { ascending: true })
                        .range(from, from + batchSize - 1);

                    if (error) {
                        console.error('Error fetching monthly tasks batch:', error);
                        throw error;
                    }

                    console.log(`📊 取得結果: ${data?.length || 0}件`);
                    if (!data || data.length === 0) {
                        console.log('📊 データなし、ループ終了');
                        break;
                    }

                    allData = allData.concat(data);
                    console.log(`月次タスクデータ取得中: ${allData.length}件`);

                    // 取得件数がバッチサイズより少ない場合は最後のバッチ
                    if (data.length < batchSize) {
                        console.log(`📊 最後のバッチ (${data.length}件 < ${batchSize}件)`);
                        break;
                    }

                    from += batchSize;
                }

                console.log(`月次タスクデータ取得完了: 総計${allData.length}件`);
                return allData;
            }
        } catch (err) {
            console.error(`Error fetching monthly tasks:`, err);
            return clientId !== null && month !== null ? null : [];
        }
    }

    static async getAllMonthlyTasksForClient(clientId) {
        const { data, error } = await supabase
            .from('monthly_tasks')
            .select('*')
            .eq('client_id', clientId);

        if (error) {
            console.error(`Error fetching all monthly tasks for client ${clientId}:`, error);
            throw error;
        }
        return data;
    }

    // 全クライアントの月次タスクを一括取得（パフォーマンス最適化）
    static async getAllMonthlyTasksForAllClients() {
        let allData = [];
        let from = 0;
        const batchSize = 1000;

        while (true) {
            const { data, error } = await supabase
                .from('monthly_tasks')
                .select('*')
                .order('month', { ascending: false }) // 新しい月から
                .order('completed', { ascending: false }) // 完了済みを先に（index.js用）
                .order('id', { ascending: true }) // RLS問題回避のためidでソート
                .range(from, from + batchSize - 1);

            if (error) {
                console.error('Error fetching monthly tasks batch for all clients:', error);
                throw error;
            }

            if (!data || data.length === 0) break;

            allData = allData.concat(data);

            // 取得件数がバッチサイズより少ない場合は最後のバッチ
            if (data.length < batchSize) break;

            from += batchSize;
        }

        console.log(`全クライアント月次タスクデータ取得完了: 総計${allData.length}件`);
        return allData;
    }
    
    static async createMonthlyTask(taskData) {
        const { data, error } = await supabase
            .from('monthly_tasks')
            .insert(taskData)
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
    
    static async updateMonthlyTask(id, taskData) {
        const { data, error } = await supabase
            .from('monthly_tasks')
            .update(taskData)
            .eq('id', id)
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
    
    static async upsertMonthlyTask(clientId, month, taskData) {
        const { data, error } = await supabase
            .from('monthly_tasks')
            .upsert({
                client_id: clientId,
                month: month,
                ...taskData
            }, {
                onConflict: 'client_id,month'
            })
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
    
    // 設定関連
    static async getSetting(key) {
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', key)
                .maybeSingle();
                
            if (error) {
                console.warn(`Setting '${key}' error:`, error.message, error.code);
                // Return default values for common settings
                const defaults = {
                    'yellow_threshold': 7,
                    'red_threshold': 3,
                    'yellow_color': '#FFFF99',
                    'red_color': '#FFB6C1',
                    'font_family': 'Arial, sans-serif',
                    'hide_inactive_clients': false
                };
                return defaults[key] || null;
            }
            return data?.value;
        } catch (err) {
            console.error(`Critical error accessing setting '${key}':`, err);
            // Return safe defaults
            const defaults = {
                'yellow_threshold': 7,
                'red_threshold': 3,
                'yellow_color': '#FFFF99',
                'red_color': '#FFB6C1',
                'font_family': 'Arial, sans-serif',
                'hide_inactive_clients': false
            };
            return defaults[key] || null;
        }
    }
    
    static async setSetting(key, value) {
        const { error } = await supabase
            .from('settings')
            .upsert({
                key: key,
                value: value
            });
            
        if (error) throw error;
    }
    
    // デフォルトタスク関連
    static async getDefaultTasks() {
        const { data, error } = await supabase
            .from('default_tasks')
            .select('*')
            .eq('is_active', true)
            .order('display_order');
            
        if (error) throw error;
        return data;
    }
    
    static async getDefaultTasksByAccountingMethod(accountingMethod) {
        const { data, error } = await supabase
            .from('default_tasks')
            .select('*')
            .eq('accounting_method', accountingMethod)
            .eq('is_active', true)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return [];
        
        // Parse tasks JSON field
        try {
            return typeof data.tasks === 'string' ? JSON.parse(data.tasks) : data.tasks || [];
        } catch (e) {
            console.error('Error parsing tasks JSON:', e);
            return [];
        }
    }
    
    static async upsertDefaultTasks(accountingMethod, tasks) {
        try {
            // 既存レコードを検索
            const { data: existing, error: searchError } = await supabase
                .from('default_tasks')
                .select('*')
                .eq('accounting_method', accountingMethod)
                .maybeSingle();

            if (searchError) throw searchError;

            const taskData = {
                accounting_method: accountingMethod,
                tasks: JSON.stringify(tasks),
                task_name: `${accountingMethod}セット`,
                display_order: accountingMethod === '記帳代行' ? 999 : 998,
                is_active: true
            };

            if (existing) {
                // 更新
                const { data, error } = await supabase
                    .from('default_tasks')
                    .update(taskData)
                    .eq('id', existing.id)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                // 新規作成
                const { data, error } = await supabase
                    .from('default_tasks')
                    .insert(taskData)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }
        } catch (error) {
            console.error('Error in upsertDefaultTasks:', error);
            throw error;
        }
    }
    
    // 経理方式別初期項目設定機能
    static async setupInitialTasksForClient(clientId) {
        try {
            // Get client info
            const client = await this.getClient(clientId);
            if (!client.accounting_method) {
                throw new Error('クライアントに経理方式が設定されていません');
            }
            
            // Get default tasks for this accounting method
            const defaultTasks = await this.getDefaultTasksByAccountingMethod(client.accounting_method);
            if (defaultTasks.length === 0) {
                throw new Error(`${client.accounting_method}の初期項目が設定されていません`);
            }
            
            // Set up custom tasks for current year
            const currentYear = new Date().getFullYear();
            const customTasksByYear = client.custom_tasks_by_year || {};
            customTasksByYear[currentYear] = defaultTasks;
            
            // Update client
            const updatedClient = await this.updateClient(clientId, {
                custom_tasks_by_year: customTasksByYear
            });
            
            return {
                client: updatedClient,
                tasks: defaultTasks,
                year: currentYear
            };
            
        } catch (error) {
            console.error('Error setting up initial tasks:', error);
            throw error;
        }
    }
    
    static async checkIfClientNeedsInitialSetup(clientId) {
        try {
            const client = await this.getClient(clientId);
            const currentYear = new Date().getFullYear();
            
            // Check if client has accounting method
            if (!client.accounting_method || !['記帳代行', '自計'].includes(client.accounting_method)) {
                return { needs: false, reason: '経理方式が未設定または不明' };
            }
            
            // Check if client has custom tasks for current year
            const customTasks = client.custom_tasks_by_year;
            if (!customTasks || typeof customTasks !== 'object') {
                return { needs: true, reason: 'カスタムタスクが未設定' };
            }
            
            if (!customTasks[currentYear] || !Array.isArray(customTasks[currentYear])) {
                return { needs: true, reason: `${currentYear}年のタスクが未設定` };
            }
            
            if (customTasks[currentYear].length === 0) {
                return { needs: true, reason: 'タスクリストが空' };
            }
            
            return { needs: false, reason: '初期設定済み' };
            
        } catch (error) {
            console.error('Error checking client setup status:', error);
            return { needs: false, reason: 'エラー: ' + error.message };
        }
    }
    
    // 編集セッション関連（悲観ロック）
    static async createEditingSession(clientId, userId) {
        const { data, error } = await supabase
            .from('editing_sessions')
            .insert({
                client_id: clientId,
                user_id: userId
            })
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
    
    static async updateEditingSession(sessionId) {
        const { error } = await supabase
            .from('editing_sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('id', sessionId);
            
        if (error) throw error;
    }
    
    static async deleteEditingSession(sessionId) {
        const { error } = await supabase
            .from('editing_sessions')
            .delete()
            .eq('id', sessionId);
            
        if (error) throw error;
    }
    
    static async getActiveEditingSessions(clientId) {
        const { data, error } = await supabase
            .from('editing_sessions')
            .select('*')
            .eq('client_id', clientId)
            .gte('last_activity', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // 30分以内
            
        if (error) throw error;
        return data;
    }
    
    // 認証関連（後で実装）
    static async signInWithGoogle(signInOptions = {}) {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // 担当者選択画面へリダイレクト
                redirectTo: window.location.origin + '/select-user.html',
                ...signInOptions
            }
        });

        if (error) throw error;
        return data;
    }
    
    static async signOut() {
        // 担当者選択情報をクリア
        sessionStorage.removeItem('selected-staff-id');
        sessionStorage.removeItem('selected-staff-name');
        sessionStorage.removeItem('selected-staff-email');
        sessionStorage.removeItem('settings-access');

        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
    
    static async getCurrentUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    }

    static async getCurrentUserWithRouting() {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;

        if (user) {
            // 担当者選択チェック
            const selectedStaffId = sessionStorage.getItem('selected-staff-id');
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';

            // select-user.html以外で担当者未選択の場合は選択画面へ
            if (!selectedStaffId && currentPage !== 'select-user.html') {
                window.location.replace('/select-user.html');
                return null;
            }

            // 設定画面への意図的アクセスかチェック
            const urlParams = new URLSearchParams(window.location.search);
            const isSettingsPage = currentPage === 'index.html';
            const isSettingsAccess = urlParams.has('settings') ||
                                   sessionStorage.getItem('settings-access') === 'true';

            // index.htmlかつ設定アクセスでない場合はリダイレクト
            if (isSettingsPage && !isSettingsAccess) {
                window.location.replace('analytics.html');
                return null; // リダイレクト中なのでnullを返す
            }

            // 設定画面の場合はフラグクリア
            if (isSettingsAccess) {
                sessionStorage.removeItem('settings-access');
            }
        }

        return user;
    }

    // 選択された担当者IDを取得
    static getSelectedStaffId() {
        return sessionStorage.getItem('selected-staff-id');
    }

    // 選択された担当者情報を取得
    static async getSelectedStaff() {
        const staffId = this.getSelectedStaffId();
        if (!staffId) return null;

        const { data, error } = await supabase
            .from('staffs')
            .select('*')
            .eq('id', parseInt(staffId))
            .single();

        if (error) {
            console.error('Error fetching selected staff:', error);
            return null;
        }

        return data;
    }

    // 設定画面用の専用リダイレクト関数
    static redirectToSettings() {
        sessionStorage.setItem('settings-access', 'true');
        // ルートからの絶対パスでリダイレクト（サブディレクトリからでも正しく動作）
        const baseUrl = window.location.origin;
        window.location.href = `${baseUrl}/index.html?settings=true`;
    }

    static async getUserRole() {
        const { data, error } = await supabase.rpc('get_user_role');
        if (error) {
            // RLSが有効になった直後など、関数が存在しない場合も考慮
            console.error('Error fetching user role:', error);
            return null;
        }
        return data;
    }
    
    // CSV エクスポート・インポート機能
    static async exportClientsCSV() {
        try {
            // 全クライアントデータを取得
            const { data: clients, error } = await supabase
                .from('clients')
                .select(`
                    *,
                    staffs(name)
                `)
                .order('id');
                
            if (error) throw error;
            
            // CSVヘッダー
            const csvHeaders = [
                'ID', '事業所名', '決算月', '担当者名', '経理方式', 'ステータス'
            ];
            
            // CSVデータ生成
            const csvData = [csvHeaders];
            clients.forEach(client => {
                csvData.push([
                    client.id,
                    client.name || '',
                    client.fiscal_month || '',
                    client.staffs?.name || '',
                    client.accounting_method || '',
                    client.status || 'active'
                ]);
            });
            
            return csvData;
        } catch (error) {
            console.error('CSV export error:', error);
            throw error;
        }
    }
    
    static async importClientsCSV(csvData) {
        try {
            // 現在のクライアントIDリストを取得（重複チェック用）
            const { data: existingClients } = await supabase
                .from('clients')
                .select('id, name');
            
            const existingIds = new Set(existingClients.map(c => c.id));
            const existingNames = new Set(existingClients.map(c => c.name));
            
            // スタッフ情報を取得（名前からIDを検索するため）
            const { data: staffs } = await supabase
                .from('staffs')
                .select('id, name');
            
            const staffNameToId = {};
            staffs.forEach(staff => {
                staffNameToId[staff.name] = staff.id;
            });
            
            const toUpdate = [];
            const toInsert = [];
            const errors = [];
            
            // CSVデータの検証と分類
            for (let i = 1; i < csvData.length; i++) {
                const row = csvData[i];
                if (row.length < 6) {
                    errors.push(`行 ${i + 1}: 列数が不足しています`);
                    continue;
                }
                
                const [id, name, fiscal_month, staff_name, accounting_method, status] = row;
                
                // 必須項目チェック
                if (!name?.trim()) {
                    errors.push(`行 ${i + 1}: 事業所名が空です`);
                    continue;
                }
                
                // 経理方式チェック
                if (accounting_method && !['記帳代行', '自計'].includes(accounting_method.trim())) {
                    errors.push(`行 ${i + 1}: 経理方式は「記帳代行」または「自計」である必要があります`);
                    continue;
                }
                
                // 担当者存在チェック
                let staff_id = null;
                if (staff_name?.trim()) {
                    staff_id = staffNameToId[staff_name.trim()];
                    if (!staff_id) {
                        errors.push(`行 ${i + 1}: 担当者「${staff_name}」が見つかりません`);
                        continue;
                    }
                }
                
                const clientData = {
                    name: name.trim(),
                    fiscal_month: fiscal_month ? parseInt(fiscal_month) : null,
                    staff_id: staff_id,
                    accounting_method: accounting_method?.trim() || null,
                    status: status?.trim() || 'active'
                };
                
                // ID処理
                if (id && id.trim() !== '' && !isNaN(parseInt(id))) {
                    const numId = parseInt(id);
                    
                    if (existingIds.has(numId)) {
                        // 既存データの更新
                        toUpdate.push({ id: numId, ...clientData });
                    } else {
                        // 新規追加（重複しないIDを指定）
                        // 同じ名前の事業所が既に存在するかチェック
                        if (existingNames.has(clientData.name)) {
                            errors.push(`行 ${i + 1}: 事業所名「${clientData.name}」は既に存在します`);
                            continue;
                        }
                        // IDを指定して新規追加
                        toInsert.push({ id: numId, ...clientData });
                    }
                } else {
                    // 新規追加（IDなしまたは無効なID - 自動採番）
                    // 同じ名前の事業所が既に存在するかチェック
                    if (existingNames.has(clientData.name)) {
                        errors.push(`行 ${i + 1}: 事業所名「${clientData.name}」は既に存在します`);
                        continue;
                    }
                    toInsert.push(clientData);
                }
            }
            
            if (errors.length > 0) {
                throw new Error('CSVデータにエラーがあります:\n' + errors.join('\n'));
            }
            
            const results = { updated: 0, inserted: 0 };
            
            // 更新処理
            if (toUpdate.length > 0) {
                for (const client of toUpdate) {
                    const { id, ...updateData } = client;
                    const { error } = await supabase
                        .from('clients')
                        .update(updateData)
                        .eq('id', id);
                    
                    if (error) throw error;
                    results.updated++;
                }
            }
            
            // 新規追加処理
            if (toInsert.length > 0) {
                const { data: insertedClients, error } = await supabase
                    .from('clients')
                    .insert(toInsert)
                    .select();
                
                if (error) throw error;
                results.inserted = insertedClients.length;
                
                // 新規追加されたクライアントに初期タスクを設定
                for (const client of insertedClients) {
                    if (client.accounting_method) {
                        await this.setupInitialTasksForNewClient(client.id, client.accounting_method);
                    }
                }
            }
            
            return {
                success: true,
                results: results,
                message: `インポート完了: ${results.updated}件更新, ${results.inserted}件追加`
            };
            
        } catch (error) {
            console.error('CSV import error:', error);
            throw error;
        }
    }
    
    // 新規クライアントの初期タスク設定
    static async setupInitialTasksForNewClient(clientId, accountingMethod) {
        try {
            const defaultTasksData = await this.getDefaultTasksByAccountingMethod(accountingMethod);
            const currentYear = new Date().getFullYear();
            
            const customTasksByYear = {
                [currentYear]: defaultTasksData
            };
            
            const { error } = await supabase
                .from('clients')
                .update({ 
                    custom_tasks_by_year: customTasksByYear 
                })
                .eq('id', clientId);
                
            if (error) throw error;
            
        } catch (error) {
            console.error('初期タスク設定エラー:', error);
            // エラーが発生してもクライアント作成は成功とする
        }
    }
    
    // データベース初期化機能
    static async resetDatabase() {
        try {
            // 各テーブルのデータを削除（外部キー制約の順番を考慮）
            await supabase.from('monthly_tasks').delete().neq('id', 0);
            await supabase.from('editing_sessions').delete().neq('id', 0);
            await supabase.from('clients').delete().neq('id', 0);
            await supabase.from('default_tasks').delete().neq('id', 0);
            await supabase.from('settings').delete().neq('key', '');
            
            // サンプルスタッフデータを挿入
            const sampleStaffs = [
                { name: '田中太郎' },
                { name: '佐藤花子' },
                { name: '鈴木一郎' },
                { name: '山田美咲' }
            ];
            
            const { data: staffData } = await supabase
                .from('staffs')
                .insert(sampleStaffs)
                .select();
            
            // サンプルクライアントデータを挿入
            const sampleClients = [
                {
                    name: 'サンプル会社A',
                    fiscal_month: 3,
                    staff_id: staffData[0].id,
                    accounting_method: '記帳代行',
                    status: 'active',
                    custom_tasks_by_year: {},
                    finalized_years: []
                },
                {
                    name: 'サンプル会社B', 
                    fiscal_month: 12,
                    staff_id: staffData[1].id,
                    accounting_method: '自計',
                    status: 'active',
                    custom_tasks_by_year: {},
                    finalized_years: []
                },
                {
                    name: 'サンプル会社C',
                    fiscal_month: 9,
                    staff_id: staffData[2].id,
                    accounting_method: '記帳代行',
                    status: 'active',
                    custom_tasks_by_year: {},
                    finalized_years: []
                }
            ];
            
            await supabase.from('clients').insert(sampleClients);
            
            // デフォルトタスクを挿入
            const defaultTasks = [
                {
                    task_name: '記帳代行デフォルト',
                    accounting_method: '記帳代行',
                    tasks: JSON.stringify([
                        '資料受付', '仕訳入力', '担当チェック', '不明投げかけ',
                        '月次完了'
                    ]),
                    display_order: 1,
                    is_active: true
                },
                {
                    task_name: '自計デフォルト',
                    accounting_method: '自計',
                    tasks: JSON.stringify([
                        'データ受領', '仕訳チェック', '不明投げかけ', '月次完了'
                    ]),
                    display_order: 2,
                    is_active: true
                }
            ];
            
            await supabase.from('default_tasks').insert(defaultTasks);
            
            // 基本設定を挿入
            const basicSettings = [
                { key: 'yellow_threshold', value: 2 },
                { key: 'red_threshold', value: 3 },
                { key: 'yellow_color', value: '#FFFF99' },
                { key: 'red_color', value: '#FFCDD2' },
                { key: 'font_family', value: 'Noto Sans JP' },
                { key: 'hide_inactive_clients', value: false }
            ];
            
            await supabase.from('settings').insert(basicSettings);
            
            return { success: true, message: 'データベースが正常に初期化されました' };
        } catch (error) {
            console.error('Database reset error:', error);
            throw error;
        }
    }

    // 月次タスクの状態を取得（新しい整合性チェック用）
    static async getMonthlyTasksState(clientId, year) {
        try {
            // クライアント情報を取得して決算月を確認
            const client = await this.getClient(clientId);
            const fiscalMonth = client.fiscal_month || 3; // デフォルト3月決算
            
            // 決算月を終点とする12ヶ月の期間を計算
            // 例：決算月3月、2026年度 → 2025年4月～2026年3月
            // 例：決算月7月、2026年度 → 2025年8月～2026年7月
            const startMonth = fiscalMonth === 12 ? 
                `${year}-01` : 
                `${parseInt(year) - 1}-${(fiscalMonth + 1).toString().padStart(2, '0')}`;
            const endMonth = `${year}-${fiscalMonth.toString().padStart(2, '0')}`;
            
            const { data: monthlyData, error } = await supabase
                .from('monthly_tasks')
                .select('month, tasks, task_memos, status')
                .eq('client_id', clientId)
                .gte('month', startMonth)
                .lte('month', endMonth)
                .order('month');
            
            if (error) throw error;
            
            // 決算月を基準に年度内の全ての月を生成
            const allMonths = [];
            for (let i = 0; i < 12; i++) {
                let targetMonth, targetYear;
                
                if (fiscalMonth === 12) {
                    // 12月決算の場合：1月～12月
                    targetMonth = i + 1;
                    targetYear = parseInt(year);
                } else {
                    // その他の決算月の場合：(決算月+1)月から始まって決算月で終わる
                    const startMonthNum = fiscalMonth + 1;
                    const currentMonthNum = startMonthNum + i;
                    
                    if (currentMonthNum <= 12) {
                        targetMonth = currentMonthNum;
                        targetYear = parseInt(year) - 1;
                    } else {
                        targetMonth = currentMonthNum - 12;
                        targetYear = parseInt(year);
                    }
                }
                
                const monthKey = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
                allMonths.push(monthKey);
            }
            
            // 月をキーとした辞書形式に変換（存在しない月は空のデータで初期化）
            const state = {};
            allMonths.forEach(monthKey => {
                const foundData = monthlyData?.find(data => data.month === monthKey);
                if (foundData) {
                    // JSON文字列として保存されている場合のパース処理
                    let tasks = foundData.tasks || {};
                    let taskMemos = foundData.task_memos || {};
                    
                    if (typeof tasks === 'string') {
                        try {
                            tasks = JSON.parse(tasks);
                        } catch (e) {
                            console.warn('Failed to parse tasks JSON:', tasks);
                            tasks = {};
                        }
                    }
                    
                    if (typeof taskMemos === 'string') {
                        try {
                            taskMemos = JSON.parse(taskMemos);
                        } catch (e) {
                            console.warn('Failed to parse task_memos JSON:', taskMemos);
                            taskMemos = {};
                        }
                    }
                    
                    state[monthKey] = {
                        tasks: tasks,
                        task_memos: taskMemos,
                        status: foundData.status
                    };
                } else {
                    // データベースに存在しない月は空のオブジェクトで初期化
                    state[monthKey] = {
                        tasks: {},
                        task_memos: {},
                        status: null
                    };
                }
            });
            
            return state;
            
        } catch (error) {
            console.error('Error getting monthly tasks state:', error);
            throw error;
        }
    }

    // 月次タスクの状態を更新（新しい整合性チェックの自動修復用）
    static async updateMonthlyTasksByMonth(clientId, month, updateData) {
        try {
                
            // 既存のレコードを取得
            const { data: existingData, error: selectError } = await supabase
                .from('monthly_tasks')
                .select('*')
                .eq('client_id', clientId)
                .eq('month', month)
                .single();
            
            if (selectError && selectError.code !== 'PGRST116') {
                throw selectError;
            }
            
            if (existingData) {
                // 既存レコードを更新
                const updatedTasks = { ...existingData.tasks, ...updateData.tasks };
                const updatedMemos = { ...existingData.task_memos, ...updateData.task_memos };
                
                const { data, error } = await supabase
                    .from('monthly_tasks')
                    .update({ 
                        tasks: updatedTasks,
                        task_memos: updatedMemos 
                    })
                    .eq('client_id', clientId)
                    .eq('month', month)
                    .select()
                    .single();
                
                if (error) throw error;
                return data;
            } else {
                // 新しいレコードを作成
                const { data, error } = await supabase
                    .from('monthly_tasks')
                    .insert({
                        client_id: clientId,
                        month: month,
                        tasks: updateData.tasks || {},
                        task_memos: updateData.task_memos || {},
                        status: 'in_progress'
                    })
                    .select()
                    .single();
                
                if (error) throw error;
                return data;
            }
            
        } catch (error) {
            console.error('Error updating monthly tasks by month:', error);
            throw error;
        }
    }

    // データ整合性チェック機能（旧版）
    static async checkDataConsistency(clientId, year) {
        try {
            // 1. クライアントのカスタムタスク取得
            const client = await this.getClient(clientId);
            const customTasks = client.custom_tasks_by_year?.[year] || [];
            
            // 2. 該当年度の全月次データ取得
            const startMonth = `${year}-04`;
            const endMonth = `${parseInt(year) + 1}-03`;
            
            const { data: monthlyData, error } = await supabase
                .from('monthly_tasks')
                .select('*')
                .eq('client_id', clientId)
                .gte('month', startMonth)
                .lte('month', endMonth)
                .order('month');
            
            if (error) throw error;
            
            // 3. 整合性チェック実行
            const result = this._performConsistencyCheck(customTasks, monthlyData || [], year);
            
            return {
                success: true,
                client_name: client.name,
                year: year,
                ...result
            };
            
        } catch (error) {
            console.error('Data consistency check error:', error);
            throw error;
        }
    }
    
    // データ整合性の自動修復
    static async repairDataConsistency(clientId, year, repairActions) {
        try {
            const results = [];
            
            for (const action of repairActions) {
                switch (action.type) {
                    case 'add_missing_month':
                        // 欠落した月次データを作成
                        await this.createMonthlyTask(clientId, action.month, {
                            tasks: action.defaultTasks || {},
                            status: 'pending'
                        });
                        results.push(`${action.month}: 月次データを作成`);
                        break;
                        
                    case 'update_task_structure':
                        // タスク構造を更新
                        await this.updateMonthlyTask(action.monthlyTaskId, {
                            tasks: action.newTaskStructure
                        });
                        results.push(`${action.month}: タスク構造を更新`);
                        break;
                        
                    case 'remove_obsolete_tasks':
                        // 廃止されたタスクを削除
                        const { data: monthlyTask } = await supabase
                            .from('monthly_tasks')
                            .select('tasks')
                            .eq('id', action.monthlyTaskId)
                            .single();
                            
                        if (monthlyTask) {
                            const updatedTasks = { ...monthlyTask.tasks };
                            for (const taskKey of action.obsoleteTaskKeys) {
                                delete updatedTasks[taskKey];
                            }
                            
                            await this.updateMonthlyTask(action.monthlyTaskId, {
                                tasks: updatedTasks
                            });
                            results.push(`${action.month}: 廃止タスクを削除`);
                        }
                        break;
                }
            }
            
            return {
                success: true,
                repaired_items: results
            };
            
        } catch (error) {
            console.error('Data repair error:', error);
            throw error;
        }
    }
    
    // 整合性チェックのコア処理
    static _performConsistencyCheck(customTasks, monthlyData, year) {
        const issues = [];
        const stats = {
            total_tasks: customTasks.length,
            total_months: monthlyData.length,
            missing_months: [],
            inconsistent_tasks: [],
            obsolete_tasks: []
        };
        
        // カスタムタスクのキー一覧を作成
        const customTaskKeys = customTasks.map(task => task.name || task);
        
        // 期待される月数（4月-3月の12ヶ月）
        const expectedMonths = [];
        const startYear = parseInt(year);
        for (let i = 4; i <= 15; i++) {
            const month = i <= 12 ? i : i - 12;
            const monthYear = i <= 12 ? startYear : startYear + 1;
            expectedMonths.push(`${monthYear}-${month.toString().padStart(2, '0')}`);
        }
        
        // 1. 欠落月次データチェック
        const existingMonths = monthlyData.map(data => data.month);
        stats.missing_months = expectedMonths.filter(month => !existingMonths.includes(month));
        
        if (stats.missing_months.length > 0) {
            issues.push({
                type: 'missing_months',
                severity: 'warning',
                message: `${stats.missing_months.length}ヶ月分のデータが不足しています`,
                details: stats.missing_months
            });
        }
        
        // 2. タスク項目の整合性チェック
        monthlyData.forEach(monthly => {
            const dbTaskKeys = Object.keys(monthly.tasks || {});
            
            // 不足しているタスク
            const missingTasks = customTaskKeys.filter(key => !dbTaskKeys.includes(key));
            if (missingTasks.length > 0) {
                stats.inconsistent_tasks.push({
                    month: monthly.month,
                    missing: missingTasks
                });
            }
            
            // 廃止されたタスク  
            const obsoleteTasks = dbTaskKeys.filter(key => !customTaskKeys.includes(key));
            if (obsoleteTasks.length > 0) {
                stats.obsolete_tasks.push({
                    month: monthly.month,
                    obsolete: obsoleteTasks
                });
            }
        });
        
        if (stats.inconsistent_tasks.length > 0) {
            issues.push({
                type: 'inconsistent_tasks',
                severity: 'error',
                message: 'タスク項目に不整合があります',
                details: stats.inconsistent_tasks
            });
        }
        
        if (stats.obsolete_tasks.length > 0) {
            issues.push({
                type: 'obsolete_tasks',
                severity: 'warning',
                message: '廃止されたタスク項目がDBに残存しています',
                details: stats.obsolete_tasks
            });
        }
        
        // 3. 進捗整合性チェック（completedフラグとタスクチェック状況）
        let progressInconsistencies = 0;
        monthlyData.forEach(monthly => {
            const tasks = monthly.tasks || {};
            const completedTasks = Object.values(tasks).filter(Boolean).length;
            const totalTasks = Object.keys(tasks).length;
            const shouldBeCompleted = totalTasks > 0 && completedTasks === totalTasks;
            
            if (shouldBeCompleted !== monthly.completed) {
                progressInconsistencies++;
            }
        });
        
        if (progressInconsistencies > 0) {
            issues.push({
                type: 'progress_inconsistency',
                severity: 'warning',
                message: `${progressInconsistencies}件の進捗状態に不整合があります`,
                details: progressInconsistencies
            });
        }
        
        return {
            is_consistent: issues.length === 0,
            issues: issues,
            stats: stats,
            summary: {
                total_issues: issues.length,
                critical_issues: issues.filter(i => i.severity === 'error').length,
                warnings: issues.filter(i => i.severity === 'warning').length
            }
        };
    }

    // データ整合性の自動修復機能
    static async fixDataConsistency(clientId, year) {
        try {
            const result = await this.checkDataConsistency(clientId, year);
            const fixes = [];

            if (result.is_consistent) {
                return {
                    success: true,
                    message: 'データは既に整合性が保たれています',
                    fixes: []
                };
            }

            // 1. progress_inconsistency の修復
            const progressIssue = result.issues.find(issue => issue.type === 'progress_inconsistency');
            if (progressIssue) {
                // 該当年度の全月次データを取得
                const startMonth = `${year}-04`;
                const endMonth = `${parseInt(year) + 1}-03`;
                
                const { data: monthlyData, error } = await supabase
                    .from('monthly_tasks')
                    .select('*')
                    .eq('client_id', clientId)
                    .gte('month', startMonth)
                    .lte('month', endMonth);
                
                if (error) throw error;

                // 進捗状態を修正
                for (const monthly of monthlyData) {
                    const tasks = monthly.tasks || {};
                    const completedTasks = Object.values(tasks).filter(Boolean).length;
                    const totalTasks = Object.keys(tasks).length;
                    const shouldBeCompleted = totalTasks > 0 && completedTasks === totalTasks;
                    
                    // completedフラグが実際の完了状況と違う場合のみ更新
                    if (shouldBeCompleted !== monthly.completed) {
                        const { error: updateError } = await supabase
                            .from('monthly_tasks')
                            .update({ completed: shouldBeCompleted })
                            .eq('id', monthly.id);
                        
                        if (updateError) throw updateError;
                        
                        fixes.push({
                            type: 'progress_fix',
                            month: monthly.month,
                            old_value: monthly.completed,
                            new_value: shouldBeCompleted,
                            message: `${monthly.month}月の完了状態を ${monthly.completed} から ${shouldBeCompleted} に修正`
                        });
                    }
                }
            }

            // 2. obsolete_tasks の修復
            const obsoleteIssue = result.issues.find(issue => issue.type === 'obsolete_tasks');
            if (obsoleteIssue) {
                // クライアントの現在のカスタムタスクを取得
                const client = await this.getClient(clientId);
                const currentTasks = client.custom_tasks_by_year?.[year] || [];
                
                // 該当年度の全月次データから廃止されたタスクを削除
                const startMonth = `${year}-04`;
                const endMonth = `${parseInt(year) + 1}-03`;
                
                const { data: monthlyData, error } = await supabase
                    .from('monthly_tasks')
                    .select('*')
                    .eq('client_id', clientId)
                    .gte('month', startMonth)
                    .lte('month', endMonth);
                
                if (error) throw error;

                for (const monthly of monthlyData) {
                    const tasks = monthly.tasks || {};
                    const cleanedTasks = {};
                    let hasObsoleteTasks = false;
                    
                    // 現在のカスタムタスクに存在するタスクのみ保持
                    for (const [taskName, taskValue] of Object.entries(tasks)) {
                        if (currentTasks.includes(taskName)) {
                            cleanedTasks[taskName] = taskValue;
                        } else {
                            hasObsoleteTasks = true;
                            fixes.push({
                                type: 'obsolete_task_removal',
                                month: monthly.month,
                                task_name: taskName,
                                message: `${monthly.month}月から廃止されたタスク「${taskName}」を削除`
                            });
                        }
                    }
                    
                    // 廃止されたタスクがあった場合、データベースを更新
                    if (hasObsoleteTasks) {
                        // 完了状態も再計算
                        const completedTasks = Object.values(cleanedTasks).filter(Boolean).length;
                        const totalTasks = Object.keys(cleanedTasks).length;
                        const shouldBeCompleted = totalTasks > 0 && completedTasks === totalTasks;
                        
                        const { error: updateError } = await supabase
                            .from('monthly_tasks')
                            .update({ 
                                tasks: cleanedTasks,
                                completed: shouldBeCompleted
                            })
                            .eq('id', monthly.id);
                        
                        if (updateError) throw updateError;
                    }
                }
            }

            return {
                success: true,
                message: `${fixes.length}件の問題を修復しました`,
                fixes: fixes
            };

        } catch (error) {
            console.error('Data consistency fix error:', error);
            throw error;
        }
    }

    // App Links (Other Apps)
    static async getAppLinks() {
        const { data, error } = await supabase
            .from('app_links')
            .select('*')
            .order('display_order');
            
        if (error) throw error;
        return data;
    }

    static async createAppLinks(links) {
        const { data, error } = await supabase
            .from('app_links')
            .insert(links)
            .select('*');

        if (error) throw error;
        return data;
    }

    static async updateAppLinks(links) {
        const { data, error } = await supabase
            .from('app_links')
            .upsert(links)
            .select('*');

        if (error) throw error;
        return data;
    }

    static async deleteAppLinks(ids) {
        const { error } = await supabase
            .from('app_links')
            .delete()
            .in('id', ids);

        if (error) throw error;
    }
    
    // リアルタイム機能（将来拡張用）
    static subscribeToClientChanges(callback) {
        return supabase
            .channel('clients-changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'clients' }, 
                callback
            )
            .subscribe();
    }
    
    static subscribeToMonthlyTaskChanges(clientId, callback) {
        return supabase
            .channel(`monthly-tasks-${clientId}`)
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'monthly_tasks',
                    filter: `client_id=eq.${clientId}`
                }, 
                callback
            )
            .subscribe();
    }

    // データベースバックアップ機能
    static async createFullBackup() {
        try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupData = {
                timestamp,
                version: '1.0',
                database: 'jigyosya-management',
                tables: {}
            };

            // 全テーブルからデータを取得 (編集セッション含む)
            const tables = ['clients', 'staffs', 'monthly_tasks', 'editing_sessions', 'settings', 'default_tasks', 'app_links'];
            
            let totalRecords = 0;
            
            for (const tableName of tables) {

                try {
                    // ページネーションで全件取得（1000件制限回避）
                    let allData = [];
                    let from = 0;
                    const batchSize = 1000;

                    while (true) {
                        let query = supabase
                            .from(tableName)
                            .select('*');

                        // テーブル別ソート条件
                        if (tableName === 'monthly_tasks') {
                            query = query
                                .order('client_id', { ascending: true })
                                .order('month', { ascending: false })
                                .order('completed', { ascending: false })
                                .order('id', { ascending: true });
                        } else if (tableName === 'settings') {
                            query = query.order('key', { ascending: true });
                        } else {
                            query = query.order('id', { ascending: true });
                        }

                        const { data, error } = await query.range(from, from + batchSize - 1);

                        if (error) {
                            console.error(`${tableName} バックアップ取得エラー:`, error);
                            throw error;
                        }

                        if (!data || data.length === 0) break;

                        allData = allData.concat(data);
                        console.log(`📦 ${tableName} バックアップ中: ${allData.length}件`);

                        // 取得件数がバッチサイズより少ない場合は最後のバッチ
                        if (data.length < batchSize) break;

                        from += batchSize;
                    }

                    const data = allData;
                    
                    backupData.tables[tableName] = data || [];
                    const recordCount = data?.length || 0;
                    totalRecords += recordCount;
                    
                    
                    // 詳細なデータ確認（最初の数件をサンプル表示）
                    
                } catch (tableError) {
                    console.error(`❌ ${tableName} テーブル処理中にエラー:`, tableError);
                    // エラーが発生したテーブルは空配列で初期化
                    backupData.tables[tableName] = [];
                }
            }
            
            const backupSize = JSON.stringify(backupData).length;
            
            // 全体のデータ構造をチェック
            
            return backupData;
            
        } catch (error) {
            console.error('💥 バックアップ作成エラー:', error);
            throw error;
        }
    }

    static async downloadBackup() {
        try {
            const settings = this.getBackupSettings();
            const backupData = await this.createFullBackup();
            
            let fileName;
            
            if (settings.method === 'weekly-rotation') {
                // 週次ローテーション方式
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const today = new Date().getDay();
                const dayName = dayNames[today];
                fileName = `${dayName}/jigyosya-backup-${dayName}.json`;
            } else {
                // シンプル上書き方式
                fileName = `jigyosya-backup-${backupData.timestamp}.json`;
            }
            
            // JSONファイルとしてダウンロード
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { 
                type: 'application/json;charset=utf-8' 
            });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.replace('/', '-'); // ブラウザ制限でフォルダパス使用不可のため
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // LocalStorageに履歴を保存
            localStorage.setItem('lastBackupDate', new Date().toISOString());
            
            return backupData;
        } catch (error) {
            console.error('バックアップダウンロードエラー:', error);
            throw error;
        }
    }

    // File System Access API を使用した高度なバックアップ
    static async downloadBackupWithFolder() {
        try {
            // File System Access API対応チェック
            if (!window.showDirectoryPicker) {
                // フォールバック：通常のダウンロード
                return await this.downloadBackup();
            }

            const settings = this.getBackupSettings();
            const backupData = await this.createFullBackup();
            
            // フォルダハンドルを取得（設定済みの場合）
            let directoryHandle = settings.directoryHandle;
            
            if (!directoryHandle) {
                throw new Error('バックアップフォルダが選択されていません');
            }

            let fileName;
            let subFolder = null;

            if (settings.method === 'weekly-rotation') {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const today = new Date().getDay();
                const dayName = dayNames[today];
                subFolder = dayName;
                fileName = `jigyosya-backup-${dayName}.json`;
            } else {
                fileName = `jigyosya-backup-${backupData.timestamp}.json`;
            }

            // サブフォルダの作成（週次ローテーションの場合）
            let targetHandle = directoryHandle;
            if (subFolder) {
                try {
                    targetHandle = await directoryHandle.getDirectoryHandle(subFolder, { create: true });
                } catch (error) {
                    console.warn('サブフォルダ作成失敗、親フォルダに保存:', error);
                    fileName = `${subFolder}-${fileName}`; // フォルダ名をファイル名に含める
                }
            }

            // ファイルハンドルを取得してファイルを書き込み
            const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            
            await writable.write(JSON.stringify(backupData, null, 2));
            await writable.close();

            // LocalStorageに履歴を保存
            localStorage.setItem('lastBackupDate', new Date().toISOString());
            
            return backupData;

        } catch (error) {
            console.error('フォルダバックアップエラー:', error);
            
            // エラー時はフォールバック
            return await this.downloadBackup();
        }
    }

    // データ復元機能
    static async restoreFromBackup(backupData, skipDelete = false) {
        try {
            
            if (!backupData.tables) {
                throw new Error('無効なバックアップファイルです');
            }

            // 外部キー制約を考慮した順序でテーブルを処理
            // 削除は逆順、挿入は正順で実行する
            const insertOrder = ['staffs', 'default_tasks', 'settings', 'clients', 'monthly_tasks', 'editing_sessions', 'app_links'];
            const deleteOrder = [...insertOrder].reverse(); // 逆順
            const allTables = Object.keys(backupData.tables);
            
            if (!skipDelete) {
                // まず既存データを安全な順序で削除（小さなバッチで処理）
                for (const tableName of deleteOrder) {
                    if (allTables.includes(tableName)) {
                        
                        if (tableName === 'staffs') {
                            // staffsテーブルの場合、先にclientsテーブルのstaff_idをnullに設定
                            const { data: updateData, error: updateError } = await supabase
                                .from('clients')
                                .update({ staff_id: null })
                                .not('staff_id', 'is', null)
                                .select('id');
                            
                            if (updateError) {
                                console.error('clients.staff_id null更新エラー:', updateError);
                            } else {
                            }
                        }
                        
                        // 小さなバッチで削除（Supabaseの制限対策）
                        let deleteCount = 0;
                        const batchSize = 50; // 削除バッチサイズを小さく
                        
                        while (true) {
                            const { data: deletedData, error: deleteError } = await supabase
                                .from(tableName)
                                .delete()
                                .limit(batchSize)
                                .select('id');
                            
                            if (deleteError) {
                                console.error(`${tableName} 削除エラー:`, deleteError);
                                break;
                            }
                            
                            const batchDeleteCount = deletedData?.length || 0;
                            deleteCount += batchDeleteCount;
                            
                            if (batchDeleteCount === 0) {
                                break; // 削除するデータがない
                            }
                            
                            
                            // 少し待機してレート制限を回避
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                        
                    }
                }
            } else {
            }
            
            // 順序指定されたテーブル + その他のテーブル（挿入用）
            const orderedTables = [
                ...insertOrder.filter(table => allTables.includes(table)),
                ...allTables.filter(table => !insertOrder.includes(table))
            ];
            
            const results = {};

            for (const tableName of orderedTables) {
                const tableData = backupData.tables[tableName];
                
                if (Array.isArray(tableData) && tableData.length > 0) {
                    console.log(`📊 ${tableName} 復元開始: ${tableData.length}件のデータ`);
                    try {
                        // 新しいデータを挿入（IDも含む）
                        // バッチ挿入（Supabaseは1000件制限）
                        const batchSize = 100;
                        let insertedCount = 0;
                        
                        for (let i = 0; i < tableData.length; i += batchSize) {
                            const batch = tableData.slice(i, i + batchSize);
                            console.log(`📊 ${tableName} バッチ${Math.floor(i/batchSize) + 1}: ${i}〜${i + batch.length - 1} (${batch.length}件)`);

                            // upsert方式でIDを保持して確実に復元
                            
                            let upsertOptions = { ignoreDuplicates: false };
                            let selectColumns = '*';
                            
                            // テーブルごとのスキーマに応じた処理
                            const tableSchemas = {
                                'settings': { conflict: 'key', select: 'key' },
                                'monthly_tasks': { conflict: 'client_id,month', select: 'id' },
                                // 他のテーブルはidカラムあり（デフォルト）
                            };
                            
                            const schema = tableSchemas[tableName] || { conflict: 'id', select: 'id' };
                            upsertOptions.onConflict = schema.conflict;
                            selectColumns = schema.select;
                            
                            const { data: upsertData, error: upsertError } = await supabase
                                .from(tableName)
                                .upsert(batch, upsertOptions)
                                .select(selectColumns);
                            
                            if (upsertError) {
                                console.error(`${tableName} upsertエラー詳細:`, {
                                    code: upsertError.code,
                                    message: upsertError.message,
                                    details: upsertError.details,
                                    hint: upsertError.hint,
                                    batchIndex: Math.floor(i/batchSize) + 1,
                                    batchSize: batch.length
                                });
                                
                                // RLS(Row Level Security)エラーの場合は特別な処理
                                if (upsertError.code === '42501' || upsertError.message?.includes('RLS')) {
                                    console.warn(`${tableName}: RLS制限によりupsertスキップ`);
                                    continue;
                                }

                                // 重複エラーの場合は警告して継続（削除スキップ時のデータ保護）
                                if (upsertError.code === '23505') {
                                    console.warn(`${tableName}: 重複データをスキップ（既存データ保護）`);
                                    insertedCount += batch.length; // カウントは継続
                                    continue;
                                }
                                
                                // フォールバック: 通常のinsertを試行
                                const { data: insertData, error: insertError } = await supabase
                                    .from(tableName)
                                    .insert(batch)
                                    .select(selectColumns);
                                
                                if (insertError) {
                                    console.error(`${tableName} insertエラー:`, insertError);

                                    // 挿入でも重複エラーの場合は警告して継続
                                    if (insertError.code === '23505') {
                                        console.warn(`${tableName}: insert重複データをスキップ（既存データ保護）`);
                                        insertedCount += batch.length; // カウントは継続
                                        continue;
                                    }

                                    throw new Error(`${tableName} の復元に失敗: ${insertError.message}`);
                                }
                                
                            } else {
                                // upsert成功の場合のカウント
                                insertedCount += batch.length;
                            }
                            console.log(`📊 ${tableName} バッチ完了: 累計${insertedCount}件`);

                            // レート制限対策の待機
                            if (i + batchSize < tableData.length) {
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                        }

                        console.log(`📊 ${tableName} 復元完了: ${insertedCount}件 / ${tableData.length}件`);
                        
                        // clientsテーブル復元後、staff_idの整合性を再確認
                        if (tableName === 'clients') {
                            const originalClientsData = backupData.tables['clients'];
                            
                            for (const clientData of originalClientsData) {
                                if (clientData.staff_id) {
                                    // 元のstaff_idが存在する場合、再設定
                                    const { error: updateError } = await supabase
                                        .from('clients')
                                        .update({ staff_id: clientData.staff_id })
                                        .eq('id', clientData.id);
                                    
                                    if (updateError) {
                                        console.warn(`Client ${clientData.id} のstaff_id復元エラー:`, updateError);
                                    }
                                }
                            }
                        }
                        
                        results[tableName] = { restored: insertedCount };
                        
                    } catch (error) {
                        console.error(`${tableName} 復元エラー:`, error);
                        results[tableName] = { restored: 0, error: error.message };
                        // エラーが発生しても他のテーブル処理は継続
                    }
                } else {
                    results[tableName] = { restored: 0 };
                }
            }

            return results;
        } catch (error) {
            console.error('データ復元エラー:', error);
            throw error;
        }
    }


    // 自動バックアップ管理
    static initAutoBackup() {
        const settings = this.getBackupSettings();
        
        if (settings.enabled) {
            
            // ページ読み込み時に未実行のバックアップがあるかチェック
            this.checkMissedBackups(settings);
            
            // 次回バックアップをスケジュール
            this.scheduleNextBackup(settings);
            
            // ページ離脱前の処理を設定
            this.setupBeforeUnloadHandler();
        }
    }
    
    // ページ離脱前の処理
    static setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            const nextBackupDate = localStorage.getItem('nextBackupDate');
            if (nextBackupDate) {
                // バックアップスケジュール情報をlocalStorageに保存（既に保存済み）
            }
        });
    }
    
    // 未実行のバックアップをチェック
    static checkMissedBackups(settings) {
        const lastBackupHistory = JSON.parse(localStorage.getItem('backupHistory') || '[]');
        const nextBackupDate = localStorage.getItem('nextBackupDate');
        
        if (nextBackupDate) {
            const scheduledTime = new Date(nextBackupDate);
            const now = new Date();
            
            // スケジュールされた時刻を過ぎているかチェック
            if (scheduledTime <= now) {
                const timeDiff = now - scheduledTime;
                const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
                
                if (hoursDiff >= 1) {
                    
                    // 遅延実行されたバックアップを即座に実行
                    setTimeout(() => {
                        this.executeAutoBackup(settings);
                    }, 5000); // 5秒後に実行（初期化完了を待つ）
                    
                    return;
                }
            }
        }
        
    }

    static getBackupSettings() {
        const defaultSettings = {
            enabled: false,
            frequency: 'daily',
            time: '00:00', // デフォルトを0時に変更
            method: 'cloud', // デフォルトをクラウドバックアップに変更
            path: 'downloads',
            directoryHandle: null,
            selectedPath: ''
        };
        
        const stored = localStorage.getItem('backupSettings');
        return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    }

    static saveBackupSettings(settings) {
        localStorage.setItem('backupSettings', JSON.stringify(settings));
        
        // 既存のタイマーをクリア
        if (this.backupTimer) {
            clearTimeout(this.backupTimer);
        }
        
        if (settings.enabled) {
            this.scheduleNextBackup(settings);
        } else {
            localStorage.removeItem('nextBackupDate');
        }
    }
    
    // バックアップ状況を取得
    static getBackupStatus() {
        const settings = this.getBackupSettings();
        const history = JSON.parse(localStorage.getItem('backupHistory') || '[]');
        const nextBackupDate = localStorage.getItem('nextBackupDate');
        
        const status = {
            enabled: settings.enabled,
            method: settings.method,
            time: settings.time,
            nextBackup: nextBackupDate ? new Date(nextBackupDate).toLocaleString('ja-JP') : null,
            lastBackup: history.length > 0 ? {
                timestamp: new Date(history[0].timestamp).toLocaleString('ja-JP'),
                success: history[0].success,
                method: history[0].method,
                error: history[0].error
            } : null,
            totalBackups: history.length,
            successRate: history.length > 0 ? 
                Math.round((history.filter(h => h.success).length / history.length) * 100) : 0
        };
        
        return status;
    }
    
    // デバッグ用：バックアップ状況をコンソールに表示
    static logBackupStatus() {
        const status = this.getBackupStatus();
        return status;
    }
    
    // 前回のレポートデータを取得
    static async getPreviousReportData(currentReportDate) {
        try {
            // 現在のレポート日付より前の日付を取得
            const currentDate = new Date(currentReportDate);
            
            // 最大7日前まで遡って検索
            for (let i = 1; i <= 7; i++) {
                const searchDate = new Date(currentDate);
                searchDate.setDate(searchDate.getDate() - i);
                const dateString = searchDate.toISOString().split('T')[0];
                
                try {
                    const reportFileName = `reports/backup-report-${dateString}.json`;
                    const { data, error } = await supabase.storage
                        .from('backups')
                        .download(reportFileName);
                    
                    if (!error && data) {
                        const reportText = await data.text();
                        return JSON.parse(reportText);
                    }
                } catch (e) {
                    // このファイルが見つからない場合は次の日を試す
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.error('前回レポートデータ取得エラー:', error);
            return null;
        }
    }
    
    // デバッグ用：手動バックアップテスト
    static async testBackupNow() {
        const settings = this.getBackupSettings();
        
        if (!settings.enabled) {
            return false;
        }
        
        try {
            await this.executeAutoBackup(settings);
            return true;
        } catch (error) {
            console.error('❌ バックアップテストが失敗しました:', error);
            return false;
        }
    }

    static scheduleNextBackup(settings) {
        // 次回バックアップ予定時刻を計算
        const now = new Date();
        const [hours, minutes] = settings.time.split(':').map(Number);
        const nextBackup = new Date(now);
        nextBackup.setHours(hours, minutes, 0, 0);

        // 既に時刻を過ぎている場合は翌日に設定
        if (nextBackup <= now) {
            nextBackup.setDate(nextBackup.getDate() + 1);
        }

        const timeUntilBackup = nextBackup.getTime() - now.getTime();
        
        
        // 既存のタイマーをクリア
        if (this.backupTimer) {
            clearTimeout(this.backupTimer);
        }

        // 新しいタイマーを設定
        this.backupTimer = setTimeout(() => {
            this.executeAutoBackup(settings);
        }, timeUntilBackup);

        // 次回予定をLocalStorageに保存
        localStorage.setItem('nextBackupDate', nextBackup.toISOString());
    }

    static async executeAutoBackup(settings) {
        try {
            
            // バックアップデータを取得
            const backupData = await this.getAllData();
            
            // クラウドバックアップとローカルバックアップの両方を実行
            if (settings.method === 'cloud' || settings.method === 'both') {
                await this.uploadBackupToCloud(backupData);
            }
            
            if (settings.method === 'weekly-rotation' || settings.method === 'both') {
                await this.downloadBackup();
            }
            
            // バックアップ実行履歴を保存
            const history = JSON.parse(localStorage.getItem('backupHistory') || '[]');
            history.unshift({
                timestamp: new Date().toISOString(),
                method: settings.method,
                success: true
            });
            // 履歴は最新10件まで保持
            localStorage.setItem('backupHistory', JSON.stringify(history.slice(0, 10)));
            
            
            // 次回のバックアップをスケジュール
            this.scheduleNextBackup(settings);
        } catch (error) {
            console.error('❌ 自動バックアップに失敗しました:', error);
            
            // エラー履歴を保存
            const history = JSON.parse(localStorage.getItem('backupHistory') || '[]');
            history.unshift({
                timestamp: new Date().toISOString(),
                method: settings.method,
                success: false,
                error: error.message
            });
            localStorage.setItem('backupHistory', JSON.stringify(history.slice(0, 10)));
            
            // エラーが発生してもスケジュールは継続
            setTimeout(() => {
                this.scheduleNextBackup(settings);
            }, 60000); // 1分後に再スケジュール
        }
    }

    // === Supabase Storage バックアップ機能 ===
    
    // クラウドバックアップ（Supabase Storage）
    static async uploadBackupToCloud(backupData, fileName = null) {
        try {
            
            if (!fileName) {
                // 週次ローテーション方式でファイル名生成
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const today = new Date().getDay();
                const dayName = dayNames[today];
                fileName = `weekly/${dayName}/jigyosya-backup-${dayName}.json`;
            }

            // バックアップデータの詳細チェック

            const jsonData = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });

            
            // データ内容の簡易チェック

            // Supabase Storageにアップロード（上書き）
            const { data, error } = await supabase.storage
                .from('backups')
                .upload(fileName, blob, { 
                    upsert: true,
                    cacheControl: '3600'
                });

            if (error) {
                console.error('❌ Supabase Storageアップロードエラー:', error);
                throw error;
            }

            
            // バックアップレポートデータ作成
            const reportData = this.generateBackupReport(backupData, blob.size, data.path);
            
            // 成功ログをローカルストレージに保存
            const backupHistory = this.getCloudBackupHistory();
            backupHistory.unshift({
                fileName,
                uploadedAt: new Date().toISOString(),
                size: blob.size,
                path: data.path,
                recordCount: reportData.totalRecords,
                tableBreakdown: reportData.tableBreakdown,
                reportSummary: reportData.summary
            });
            
            // バックアップレポートをSupabase Storageに保存
            await this.saveBackupReport(reportData);

            // 履歴は最新10件のみ保持
            if (backupHistory.length > 10) {
                backupHistory.splice(10);
            }

            localStorage.setItem('cloudBackupHistory', JSON.stringify(backupHistory));
            localStorage.setItem('lastCloudBackupDate', new Date().toISOString());

            // backup_history テーブルに手動バックアップを記録
            try {
                const japanTime = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString();
                await supabase
                    .from('backup_history')
                    .insert({
                        backup_date: japanTime,
                        backup_type: 'manual',
                        status: 'completed',
                        file_name: fileName,
                        file_size_kb: Math.round(blob.size / 1024),
                        total_records: reportData.totalRecords,
                        error_message: null
                    });
            } catch (historyError) {
                console.warn('⚠️ Manual backup history insert warning:', historyError);
                // Don't fail the backup for history issues
            }

            return {
                success: true,
                path: data.path,
                size: blob.size
            };

        } catch (error) {
            console.error('クラウドバックアップエラー:', error);
            throw error;
        }
    }

    // クラウドからバックアップファイル一覧を取得
    static async getCloudBackupList() {
        try {
            const { data, error } = await supabase.storage
                .from('backups')
                .list('weekly', {
                    limit: 100,
                    sortBy: { column: 'created_at', order: 'desc' }
                });

            if (error) throw error;

            return data.map(file => ({
                name: file.name,
                size: file.metadata?.size || 0,
                lastModified: file.updated_at,
                path: `weekly/${file.name}`
            }));

        } catch (error) {
            console.error('クラウドバックアップ一覧取得エラー:', error);
            throw error;
        }
    }

    // クラウドからバックアップデータをダウンロード
    static async downloadBackupFromCloud(fileName) {
        try {
            // ファイル名が指定されていない場合は最新のバックアップを取得
            if (!fileName) {
                
                // 週次ローテーションフォルダから最新ファイルを検索
                const { data: folders, error: folderError } = await supabase.storage
                    .from('backups')
                    .list('weekly', { limit: 10 });

                if (folderError) throw folderError;

                let latestFile = null;
                let latestDate = null;

                // 各曜日フォルダから最新ファイルを検索
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                for (const day of dayNames) {
                    try {
                        const { data: files, error } = await supabase.storage
                            .from('backups')
                            .list(`weekly/${day}`, { limit: 1, sortBy: { column: 'updated_at', order: 'desc' } });

                        if (!error && files && files.length > 0) {
                            const file = files[0];
                            if (file.name.endsWith('.json')) {
                                const fileDate = new Date(file.updated_at);
                                if (!latestDate || fileDate > latestDate) {
                                    latestDate = fileDate;
                                    latestFile = `weekly/${day}/${file.name}`;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`フォルダ ${day} の検索をスキップ:`, e);
                    }
                }

                if (!latestFile) {
                    throw new Error('復元可能なバックアップファイルが見つかりません');
                }

                fileName = latestFile;
            }

            const { data, error } = await supabase.storage
                .from('backups')
                .download(fileName);

            if (error) throw error;

            const text = await data.text();
            const backupData = JSON.parse(text);

            return backupData;

        } catch (error) {
            console.error('クラウドバックアップダウンロードエラー:', error);
            throw error;
        }
    }

    // クラウドバックアップ履歴取得
    static getCloudBackupHistory() {
        const stored = localStorage.getItem('cloudBackupHistory');
        return stored ? JSON.parse(stored) : [];
    }

    // バックアップレポート生成
    static generateBackupReport(backupData, fileSize, filePath) {
        // 現在時刻から正しい日本時間を計算
        const now = new Date();
        // 日本時間のタイムスタンプを直接取得
        
        const tableBreakdown = {};
        let totalRecords = 0;
        
        // 各テーブルの詳細分析
        Object.entries(backupData.tables || {}).forEach(([tableName, tableData]) => {
            const recordCount = Array.isArray(tableData) ? tableData.length : 0;
            totalRecords += recordCount;
            
            tableBreakdown[tableName] = {
                recordCount,
                tableNameJP: this.getTableNameJP(tableName),
                sampleData: Array.isArray(tableData) && tableData.length > 0 ? 
                    Object.keys(tableData[0] || {}).slice(0, 5) : []
            };
        });
        
        // 日本時間で正確な日付と時刻を取得
        const jstDateString = now.toLocaleDateString('ja-JP', {timeZone: 'Asia/Tokyo'});
        const jstTimeString = now.toLocaleTimeString('ja-JP', {timeZone: 'Asia/Tokyo'});
        
        const summary = `📊 バックアップレポート ${jstDateString} ${jstTimeString}\n\n` +
            `🗂️ 総テーブル数: ${Object.keys(tableBreakdown).length}テーブル\n` +
            `📋 総レコード数: ${totalRecords.toLocaleString()}件\n` +
            `💾 ファイルサイズ: ${Math.round(fileSize / 1024).toLocaleString()} KB\n` +
            `☁️ 保存場所: ${filePath}\n\n` +
            `📈 テーブル別詳細:\n` +
            Object.entries(tableBreakdown)
                .sort((a, b) => b[1].recordCount - a[1].recordCount)
                .map(([table, data]) => 
                    `  • ${data.tableNameJP} (${table}): ${data.recordCount.toLocaleString()}件`
                ).join('\n');
        
        return {
            timestamp: now.toISOString(),
            backupTimestamp: backupData.timestamp,
            totalTables: Object.keys(tableBreakdown).length,
            totalRecords,
            fileSizeKB: Math.round(fileSize / 1024),
            filePath,
            tableBreakdown,
            summary,
            reportDate: jstDateString,
            reportTime: jstTimeString
        };
    }

    // テーブル名の日本語変換
    static getTableNameJP(tableName) {
        const nameMap = {
            'clients': '事業者',
            'staffs': '担当者',
            'monthly_tasks': '月次タスク',
            'editing_sessions': '編集セッション',
            'settings': 'システム設定',
            'default_tasks': 'デフォルトタスク',
            'app_links': 'アプリリンク'
        };
        return nameMap[tableName] || tableName;
    }

    // バックアップレポートをSupabase Storageに保存
    static async saveBackupReport(reportData) {
        try {
            
            // 毎日上書き方式でレポートファイル名生成
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const reportFileName = `reports/backup-report-${todayStr}.json`;
            
            // レポートJSONをBlobに変換
            const reportJson = JSON.stringify(reportData, null, 2);
            const reportBlob = new Blob([reportJson], { type: 'application/json' });
            
            // Supabase Storageにレポート保存（毎日上書き）
            const { data, error } = await supabase.storage
                .from('backups')
                .upload(reportFileName, reportBlob, { 
                    upsert: true,
                    cacheControl: '3600'
                });
            
            if (error) {
                console.error('❌ レポート保存エラー:', error);
            } else {
            }
            
            // 詳細な完了通知を表示
            this.showBackupCompletionNotification(reportData);
            
        } catch (error) {
            console.error('💥 バックアップレポート保存エラー:', error);
        }
    }

    // バックアップ完了通知表示
    static showBackupCompletionNotification(reportData) {
        const notificationText = 
            `🎉 バックアップ完了！\n\n` +
            `📊 事業者: ${reportData.tableBreakdown?.clients?.recordCount || 0}件\n` +
            `👥 担当者: ${reportData.tableBreakdown?.staffs?.recordCount || 0}件\n` +
            `📋 月次タスク: ${reportData.tableBreakdown?.monthly_tasks?.recordCount || 0}件\n` +
            `💾 総容量: ${reportData.fileSizeKB} KB\n` +
            `📅 ${reportData.reportDate} ${reportData.reportTime}`;
        
        
        // Toast通知がある場合は表示
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast(
                `バックアップ完了！事業者${reportData.tableBreakdown?.clients?.recordCount || 0}件、` +
                `月次タスク${reportData.tableBreakdown?.monthly_tasks?.recordCount || 0}件 (${reportData.fileSizeKB}KB)`,
                'success',
                10000 // 10秒表示
            );
        }
    }

    // 管理者向け詳細レポートを表示（モーダル形式）
    static async showAdminBackupReport(reportData, fileSize, filePath) {
        // モーダルHTML作成
        const modal = document.createElement('div');
        modal.id = 'admin-backup-report-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); z-index: 10000; display: flex; 
            justify-content: center; align-items: center;
        `;

        // レポートデータからファイルサイズを取得（実際のバックアップファイルサイズ）
        const fileSizeKB = reportData.fileSizeKB || Math.round(fileSize / 1024);
        
        // 最終バックアップ時刻を表示（timestampを優先して日本時間で統一）
        const backupDateTime = reportData.timestamp 
            ? new Date(reportData.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : reportData.reportDate && reportData.reportTime 
                ? `${reportData.reportDate} ${reportData.reportTime}`
                : new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

        // 前回バックアップとの比較データを取得
        const previousReportData = await this.getPreviousReportData(reportData.reportDate);
        
        // テーブル詳細の表示用HTML生成（差分表示付き）
        let tableDetailsHTML = '';
        const tableBreakdown = reportData.tableBreakdown || {};
        const totalRecords = reportData.totalRecords || 0;
        
        for (const [tableName, data] of Object.entries(tableBreakdown)) {
            const count = data.recordCount || 0;
            const percentage = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : '0.0';
            const statusColor = count > 0 ? '#28a745' : '#dc3545';
            const japaneseName = data.japaneseName || tableName;
            
            // 前回との差分を計算
            let diffHTML = '';
            if (previousReportData && previousReportData.tableBreakdown && previousReportData.tableBreakdown[tableName]) {
                const previousCount = previousReportData.tableBreakdown[tableName].recordCount || 0;
                const diff = count - previousCount;
                
                if (diff !== 0) {
                    const diffColor = diff > 0 ? '#28a745' : '#dc3545';
                    const diffSymbol = diff > 0 ? '+' : '';
                    diffHTML = `<span style="color: ${diffColor}; font-size: 11px; margin-left: 5px;">(${diffSymbol}${diff})</span>`;
                }
            }
            
            tableDetailsHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee;">
                    <span style="font-weight: 500;">${japaneseName}</span>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: ${statusColor}; font-weight: bold;">${count} 件${diffHTML}</span>
                        <span style="color: #6c757d; font-size: 12px;">(${percentage}%)</span>
                    </div>
                </div>
            `;
        }

        modal.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 30px; 
                max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #343a40; display: flex; align-items: center; gap: 10px;">
                        📊 日次バックアップレポート
                    </h2>
                    <button id="close-report-modal" style="
                        background: #6c757d; color: white; border: none; 
                        border-radius: 50%; width: 30px; height: 30px; cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                    ">×</button>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">📅 バックアップ実行時刻: ${backupDateTime}</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #007bff;">${totalRecords}</div>
                            <div style="color: #6c757d; font-size: 14px;">総レコード数</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #28a745;">${fileSizeKB} KB</div>
                            <div style="color: #6c757d; font-size: 14px;">ファイルサイズ</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #17a2b8;">${Object.keys(tableBreakdown).length}</div>
                            <div style="color: #6c757d; font-size: 14px;">テーブル数</div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">📋 テーブル別詳細</h3>
                    <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 15px;">
                        ${tableDetailsHTML}
                    </div>
                </div>

                <div style="background: #e9ecef; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #495057; font-size: 14px;">💾 保存先情報</h4>
                    <div style="font-family: monospace; font-size: 12px; color: #6c757d; word-break: break-all;">
                        ${filePath || 'クラウドストレージ'}
                    </div>
                </div>

                ${previousReportData ? `
                    <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0c5460;">
                        <h4 style="margin: 0 0 10px 0; color: #0c5460; font-size: 14px;">🔍 前回比較</h4>
                        <div style="font-size: 13px; color: #0c5460;">
                            前回レポート: ${new Date(previousReportData.reportDate).toLocaleDateString('ja-JP')}<br>
                            増減がある項目には (+増加数) または (-減少数) が表示されています
                        </div>
                    </div>
                ` : ''}
                
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="download-report-btn" style="
                        background: #28a745; color: white; border: none; 
                        padding: 10px 20px; border-radius: 6px; cursor: pointer;
                        font-size: 14px; font-weight: 500;
                    ">📥 ダウンロード</button>
                    <button id="confirm-report-modal" style="
                        background: #007bff; color: white; border: none; 
                        padding: 10px 30px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; font-weight: 500;
                    ">確認しました</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // イベントリスナー設定
        const closeModal = () => {
            document.body.removeChild(modal);
            // 今日の日付を記録（再表示防止用）
            localStorage.setItem('lastAdminReportShown', new Date().toDateString());
        };

        document.getElementById('close-report-modal').addEventListener('click', closeModal);
        document.getElementById('confirm-report-modal').addEventListener('click', closeModal);
        
        // ダウンロードボタンのイベントリスナー
        document.getElementById('download-report-btn').addEventListener('click', () => {
            try {
                // レポートデータをJSONファイルとしてダウンロード
                const fileName = `backup-report-${reportData.reportDate || new Date().toISOString().split('T')[0]}.json`;
                const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                if (window.showToast) {
                    window.showToast(`レポートファイル "${fileName}" をダウンロードしました`, 'success', 3000);
                }
            } catch (error) {
                console.error('ダウンロードエラー:', error);
                if (window.showToast) {
                    window.showToast('ダウンロードに失敗しました', 'error', 3000);
                }
            }
        });
        
        // モーダル外クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 管理者の初回アクセス時にレポート表示が必要かチェック
    static shouldShowAdminReport() {
        const today = new Date().toDateString();
        const lastShown = localStorage.getItem('lastAdminReportShown');
        const backupHistory = JSON.parse(localStorage.getItem('cloudBackupHistory') || '[]');
        
        // 今日初回アクセス かつ 最新のバックアップが今日のもの
        return lastShown !== today && backupHistory.length > 0 && 
               new Date(backupHistory[0].uploadedAt).toDateString() === today;
    }

    // 最新バックアップレポートを取得して表示
    static async showLatestAdminReport() {
        try {
            if (!this.shouldShowAdminReport()) return;

            const backupHistory = JSON.parse(localStorage.getItem('cloudBackupHistory') || '[]');
            if (backupHistory.length === 0) return;

            const latestBackup = backupHistory[0];
            
            // Supabase Storageから最新のレポートを取得
            const today = new Date().toISOString().split('T')[0];
            const reportFileName = `reports/backup-report-${today}.json`;
            
            const { data, error } = await supabase.storage
                .from('backups')
                .download(reportFileName);

            if (error) {
                return;
            }

            const reportText = await data.text();
            const reportData = JSON.parse(reportText);
            
            // 管理者向けレポートを表示
            this.showAdminBackupReport(reportData, latestBackup.size, latestBackup.fileName);
            
        } catch (error) {
            console.error('管理者レポート表示エラー:', error);
        }
    }

    // 自動クラウドバックアップ実行
    static async executeAutoCloudBackup() {
        try {
            
            const backupData = await this.createFullBackup();
            const result = await this.uploadBackupToCloud(backupData);
            
            return result;

        } catch (error) {
            console.error('自動クラウドバックアップエラー:', error);
            throw error;
        }
    }

    // クラウドバックアップとローカルバックアップを統合実行
    static async executeFullBackup() {
        try {
            const results = {
                cloud: null,
                local: null,
                errors: []
            };

            // まずバックアップデータを作成
            const backupData = await this.createFullBackup();

            // 1. クラウドバックアップ実行
            try {
                results.cloud = await this.uploadBackupToCloud(backupData);
            } catch (error) {
                console.error('クラウドバックアップ失敗:', error);
                results.errors.push({ type: 'cloud', error: error.message });
            }

            // 2. ローカルバックアップ実行（緊急用）
            try {
                results.local = await this.downloadBackupWithFolder();
            } catch (error) {
                console.error('ローカルバックアップ失敗:', error);
                results.errors.push({ type: 'local', error: error.message });
            }

            return results;

        } catch (error) {
            console.error('統合バックアップエラー:', error);
            throw error;
        }
    }

    // 期間指定で月次タスクを取得
    static async getMonthlyTasksByPeriod(startPeriod, endPeriod) {
        try {
            let allData = [];
            let from = 0;
            const batchSize = 1000;

            while (true) {
                const { data, error } = await supabase
                    .from('monthly_tasks')
                    .select('*')
                    .gte('month', startPeriod)
                    .lte('month', endPeriod)
                    .order('client_id', { ascending: true })
                    .order('month', { ascending: true })
                    .order('completed', { ascending: false })
                    .order('id', { ascending: true })
                    .range(from, from + batchSize - 1);

                if (error) throw error;

                if (!data || data.length === 0) break;

                allData = allData.concat(data);

                // 取得件数がバッチサイズより少ない場合は最後のバッチ
                if (data.length < batchSize) break;

                from += batchSize;
            }

            console.log(`期間指定月次タスクデータ取得完了 (${startPeriod}～${endPeriod}): 総計${allData.length}件`);
            return allData;

        } catch (error) {
            console.error('期間指定月次タスク取得エラー:', error);
            throw error;
        }
    }

    // === 週次進捗スナップショット機能 ===

    // 現在の進捗状況をスナップショットとして保存
    static async saveWeeklySnapshot(weekDate = null, filters = {}) {
        try {
            if (!weekDate) {
                // 日本時間での今日の日付を取得
                const now = new Date();

                // 日本時間に変換（Asia/Tokyo タイムゾーンを使用）
                const japanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));

                // 今日の日付をYYYY-MM-DD形式で取得
                const year = japanTime.getFullYear();
                const month = String(japanTime.getMonth() + 1).padStart(2, '0');
                const day = String(japanTime.getDate()).padStart(2, '0');
                weekDate = `${year}-${month}-${day}`;

                console.log('🗾 日本時間基準の進捗記録:', {
                    UTC時刻: now.toISOString(),
                    日本時刻: japanTime.toLocaleString('ja-JP'),
                    記録日: weekDate
                });
            }

            console.log('📅 週次スナップショット日付:', weekDate, '（UPSERT方式で重複防止）');

            // 現在の全クライアントと月次タスクを取得
            const clients = await this.getClients();

            // フィルター条件に基づいて月次タスクを取得
            let monthlyTasks;
            if (filters.startPeriod && filters.endPeriod) {
                // 【修正】直接期間指定でフィルタリング
                const startPeriod = filters.startPeriod; // YYYY-MM形式
                const endPeriod = filters.endPeriod;     // YYYY-MM形式

                console.log('🗓️ 月次タスク期間フィルター:', {
                    startPeriod,
                    endPeriod,
                    note: '正確な期間フィルタリング'
                });

                monthlyTasks = await this.getMonthlyTasksByPeriod(startPeriod, endPeriod);
                console.log('📋 取得された月次タスク数:', monthlyTasks.length);
            } else {
                monthlyTasks = await this.getMonthlyTasks();
                console.log('📋 全月次タスク数:', monthlyTasks.length);
            }

            const snapshots = [];

            for (const client of clients) {
                if (client.status === 'inactive') continue; // 非活性クライアントはスキップ

                // 該当クライアントの全月次タスクを取得（期間累積方式）
                const clientMonthlyTasks = monthlyTasks.filter(task => task.client_id === client.id);

                let progressRate = 0;
                let completedTasks = 0;
                let totalTasks = 0;

                // 全期間のタスクを累積計算
                if (clientMonthlyTasks && clientMonthlyTasks.length > 0) {
                    for (const monthlyTask of clientMonthlyTasks) {
                        if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                            const tasks = monthlyTask.tasks;
                            const monthTotalTasks = Object.keys(tasks).length;
                            const monthCompletedTasks = Object.values(tasks).filter(Boolean).length;

                            totalTasks += monthTotalTasks;
                            completedTasks += monthCompletedTasks;
                        }
                    }

                    // 全期間累積の進捗率
                    progressRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
                }

                // 【修正】タスクがあるクライアントのみスナップショット保存
                if (totalTasks > 0) {
                    snapshots.push({
                        week_date: weekDate,
                        client_id: client.id,
                        staff_id: client.staff_id,
                        progress_rate: Math.round(progressRate * 100) / 100, // 小数点第2位まで
                        completed_tasks: completedTasks,
                        total_tasks: totalTasks,
                        fiscal_month: client.fiscal_month,
                        client_name: client.name,
                        staff_name: client.staffs?.name || null
                    });
                }
            }

            // UPSERT：重複時は最新データで更新
            if (snapshots.length > 0) {
                const { data, error } = await supabase
                    .from('weekly_progress_snapshots')
                    .upsert(snapshots, {
                        onConflict: 'week_date,client_id',
                        ignoreDuplicates: false
                    })
                    .select();

                if (error) throw error;

                console.log('✅ UPSERT完了:', {
                    保存件数: snapshots.length,
                    実際保存件数: data?.length || 0,
                    重複更新: snapshots.length !== (data?.length || 0) ? '有り' : '無し'
                });

                return {
                    success: true,
                    saved_count: snapshots.length,
                    week_date: weekDate,
                    snapshots: data
                };
            }

            return {
                success: true,
                saved_count: 0,
                week_date: weekDate,
                message: '保存対象のクライアントがありませんでした'
            };

        } catch (error) {
            console.error('週次スナップショット保存エラー:', error);
            throw error;
        }
    }

    // 週次進捗データを取得（フィルター対応）
    static async getWeeklyProgressData(filters = {}) {
        try {
            let query = supabase
                .from('weekly_progress_snapshots')
                .select('*')
                .order('week_date', { ascending: true });

            // フィルター適用
            if (filters.startDate) {
                query = query.gte('week_date', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('week_date', filters.endDate);
            }
            if (filters.staffId) {
                query = query.eq('staff_id', filters.staffId);
            }
            if (filters.fiscalMonth) {
                query = query.eq('fiscal_month', filters.fiscalMonth);
            }
            if (filters.clientName) {
                query = query.ilike('client_name', `%${filters.clientName}%`);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];

        } catch (error) {
            console.error('週次進捗データ取得エラー:', error);
            throw error;
        }
    }

    // 週次進捗トレンド分析（前週比計算）
    static async getWeeklyTrends(filters = {}) {
        try {
            const data = await this.getWeeklyProgressData(filters);

            // 週ごとにグループ化
            const weeklyData = {};
            data.forEach(snapshot => {
                if (!weeklyData[snapshot.week_date]) {
                    weeklyData[snapshot.week_date] = [];
                }
                weeklyData[snapshot.week_date].push(snapshot);
            });

            // 週次統計を計算
            const trends = [];
            const sortedWeeks = Object.keys(weeklyData).sort();

            for (let i = 0; i < sortedWeeks.length; i++) {
                const weekDate = sortedWeeks[i];
                const weekSnapshots = weeklyData[weekDate];

                const totalClients = weekSnapshots.length;

                // 【修正】累積タスク数ベースで進捗率計算（全体ダッシュボードと同じ方式）
                const totalCompletedTasks = weekSnapshots.reduce((sum, s) => sum + s.completed_tasks, 0);
                const totalAllTasks = weekSnapshots.reduce((sum, s) => sum + s.total_tasks, 0);
                const cumulativeProgress = totalAllTasks > 0 ? (totalCompletedTasks / totalAllTasks) * 100 : 0;

                // 従来の平均も保持（参考用）
                const avgProgress = totalClients > 0
                    ? weekSnapshots.reduce((sum, s) => sum + s.progress_rate, 0) / totalClients
                    : 0;

                const completedCount = weekSnapshots.filter(s => s.progress_rate >= 100).length;
                const lowProgressCount = weekSnapshots.filter(s => s.progress_rate < 50).length;

                // 【追加】月次完了数の概算計算
                // 各クライアントの進捗率から月次完了数を推定
                let estimatedMonthlyCompleted = 0;
                let estimatedTotalMonthly = 0;

                weekSnapshots.forEach(snapshot => {
                    // 期間内の推定月数（12ヶ月期間の場合）
                    const estimatedMonthsPerClient = 12; // 固定値として設定
                    estimatedTotalMonthly += estimatedMonthsPerClient;

                    // 進捗率から完了月数を推定（100%なら全月完了、50%なら半分完了）
                    const estimatedCompletedMonths = (snapshot.progress_rate / 100) * estimatedMonthsPerClient;
                    estimatedMonthlyCompleted += Math.round(estimatedCompletedMonths);
                });

                let weekOverWeekChange = null;
                if (i > 0) {
                    const previousWeek = trends[i - 1];
                    // 【修正】累積進捗率ベースで前週比計算
                    weekOverWeekChange = cumulativeProgress - previousWeek.cumulative_progress;
                }

                trends.push({
                    week_date: weekDate,
                    total_clients: totalClients,
                    // 【修正】累積進捗率をメイン指標に
                    average_progress: Math.round(cumulativeProgress * 100) / 100,
                    cumulative_progress: Math.round(cumulativeProgress * 100) / 100,
                    // 参考用として従来の平均も保持
                    client_average_progress: Math.round(avgProgress * 100) / 100,
                    completed_count: completedCount,
                    low_progress_count: lowProgressCount,
                    week_over_week_change: weekOverWeekChange ? Math.round(weekOverWeekChange * 100) / 100 : null,
                    // タスク合計情報も追加
                    total_completed_tasks: totalCompletedTasks,
                    total_all_tasks: totalAllTasks,
                    // 月次完了情報を追加
                    monthly_completed: estimatedMonthlyCompleted,
                    monthly_total: estimatedTotalMonthly,
                    snapshots: weekSnapshots
                });
            }

            return trends;

        } catch (error) {
            console.error('週次トレンド分析エラー:', error);
            throw error;
        }
    }

    // 最新の週次データを取得
    static async getLatestWeeklySnapshot() {
        try {
            const { data, error } = await supabase
                .from('weekly_progress_snapshots')
                .select('week_date')
                .order('week_date', { ascending: false })
                .limit(1);

            if (error) throw error;
            return data && data.length > 0 ? data[0].week_date : null;

        } catch (error) {
            console.error('最新スナップショット取得エラー:', error);
            throw error;
        }
    }
}

export const handleSupabaseError = (error) => {
    console.error('Supabase error:', error);

    if (error.code === 'PGRST116') {
        return 'データが見つかりません';
    } else if (error.code === '23505') {
        return '重複するデータが存在します';
    } else if (error.code === '23503') {
        return '関連データが存在しません';
    } else {
        return error.message || 'データベースエラーが発生しました';
    }
};