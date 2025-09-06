// Supabase クライアント設定
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_CONFIG } from './supabase-env.js';

// Supabaseクライアント初期化
export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

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
    static async getMonthlyTasks(clientId, month) {
        try {
            const { data, error } = await supabase
                .from('monthly_tasks')
                .select('*')
                .eq('client_id', clientId)
                .eq('month', month)
                .maybeSingle();
                
            if (error) {
                console.warn(`Monthly task not found for client ${clientId}, month ${month}:`, error);
                return null;
            }
            return data;
        } catch (err) {
            console.error(`Error fetching monthly task for client ${clientId}, month ${month}:`, err);
            return null;
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
        const { data, error } = await supabase
            .from('monthly_tasks')
            .select('*')
            .order('client_id', { ascending: true });

        if (error) {
            console.error('Error fetching all monthly tasks for all clients:', error);
            throw error;
        }
        return data;
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
            
            console.log(`Initial tasks setup completed for client ${client.name}:`, defaultTasks);
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
    static async signInWithGoogle() {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        
        if (error) throw error;
        return data;
    }
    
    static async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
    
    static async getCurrentUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
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
            
            console.log(`初期タスク設定完了: クライアントID ${clientId}, 経理方式: ${accountingMethod}`);
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

    // データ整合性チェック機能
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
            
            for (const tableName of tables) {
                console.log(`バックアップ中: ${tableName}`);
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*');
                
                if (error) throw error;
                backupData.tables[tableName] = data || [];
                console.log(`${tableName}: ${data?.length || 0} 件`);
            }

            console.log('バックアップ作成完了:', backupData);
            return backupData;
        } catch (error) {
            console.error('バックアップ作成エラー:', error);
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
            
            console.log(`バックアップ保存完了: ${subFolder ? `${subFolder}/` : ''}${fileName}`);
            return backupData;

        } catch (error) {
            console.error('フォルダバックアップエラー:', error);
            
            // エラー時はフォールバック
            console.log('フォールバック: 通常のダウンロードを実行');
            return await this.downloadBackup();
        }
    }

    // データ復元機能
    static async restoreFromBackup(backupData, skipDelete = false) {
        try {
            console.log('データ復元を開始:', backupData);
            console.log('削除スキップモード:', skipDelete);
            
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
                console.log('既存データの削除を開始...');
                for (const tableName of deleteOrder) {
                    if (allTables.includes(tableName)) {
                        console.log(`削除中: ${tableName}`);
                        
                        if (tableName === 'staffs') {
                            // staffsテーブルの場合、先にclientsテーブルのstaff_idをnullに設定
                            console.log('clients.staff_id をnullに設定中...');
                            const { data: updateData, error: updateError } = await supabase
                                .from('clients')
                                .update({ staff_id: null })
                                .not('staff_id', 'is', null)
                                .select('id');
                            
                            if (updateError) {
                                console.error('clients.staff_id null更新エラー:', updateError);
                            } else {
                                console.log(`clients.staff_id を ${updateData?.length || 0} 件null設定完了`);
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
                            
                            console.log(`${tableName}: ${deleteCount} 件削除済み（バッチ: ${batchDeleteCount}）`);
                            
                            // 少し待機してレート制限を回避
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                        
                        console.log(`${tableName} 削除完了: 合計 ${deleteCount} 件`);
                    }
                }
            } else {
                console.log('削除処理をスキップ: upsertのみで復元します');
            }
            
            // 順序指定されたテーブル + その他のテーブル（挿入用）
            const orderedTables = [
                ...insertOrder.filter(table => allTables.includes(table)),
                ...allTables.filter(table => !insertOrder.includes(table))
            ];
            
            const results = {};

            console.log('データの挿入を開始...');
            for (const tableName of orderedTables) {
                console.log(`復元中: ${tableName}`);
                const tableData = backupData.tables[tableName];
                
                if (Array.isArray(tableData) && tableData.length > 0) {
                    try {
                        // 新しいデータを挿入（IDも含む）
                        // バッチ挿入（Supabaseは1000件制限）
                        const batchSize = 100;
                        let insertedCount = 0;
                        
                        for (let i = 0; i < tableData.length; i += batchSize) {
                            const batch = tableData.slice(i, i + batchSize);
                            
                            // upsert方式でIDを保持して確実に復元
                            console.log(`${tableName} upsert実行: ${batch.length} 件 (${insertedCount + 1}-${insertedCount + batch.length})`);
                            
                            let upsertOptions = { ignoreDuplicates: false };
                            let selectColumns = '*';
                            
                            // テーブルごとのスキーマに応じた処理
                            const tableSchemas = {
                                'settings': { conflict: 'key', select: 'key' },
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
                                    hint: upsertError.hint
                                });
                                
                                // RLS(Row Level Security)エラーの場合は特別な処理
                                if (upsertError.code === '42501' || upsertError.message?.includes('RLS')) {
                                    console.warn(`${tableName}: RLS制限によりupsertスキップ`);
                                    continue;
                                }
                                
                                // フォールバック: 通常のinsertを試行
                                console.log(`${tableName}: insertモードで再試行`);
                                const { data: insertData, error: insertError } = await supabase
                                    .from(tableName)
                                    .insert(batch)
                                    .select(selectColumns);
                                
                                if (insertError) {
                                    console.error(`${tableName} insertエラー:`, insertError);
                                    throw new Error(`${tableName} の復元に失敗: ${insertError.message}`);
                                }
                                
                                console.log(`${tableName}: insertで ${insertData?.length || batch.length} 件成功`);
                            } else {
                                console.log(`${tableName}: upsertで ${upsertData?.length || batch.length} 件成功`);
                            }
                            
                            insertedCount += batch.length;
                            console.log(`${tableName}: ${insertedCount}/${tableData.length} 件処理完了`);
                            
                            // レート制限対策の待機
                            if (i + batchSize < tableData.length) {
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                        }
                        
                        // clientsテーブル復元後、staff_idの整合性を再確認
                        if (tableName === 'clients') {
                            console.log('clients復元後: staff_id整合性チェック開始');
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
                            console.log('clients staff_id整合性チェック完了');
                        }
                        
                        results[tableName] = { restored: insertedCount };
                        console.log(`${tableName}: ${insertedCount} 件復元完了`);
                        
                    } catch (error) {
                        console.error(`${tableName} 復元エラー:`, error);
                        results[tableName] = { restored: 0, error: error.message };
                        // エラーが発生しても他のテーブル処理は継続
                    }
                } else {
                    results[tableName] = { restored: 0 };
                    console.log(`${tableName}: データなし`);
                }
            }

            console.log('データ復元完了:', results);
            return results;
        } catch (error) {
            console.error('データ復元エラー:', error);
            throw error;
        }
    }

    // CSV形式によるテーブル別バックアップ・復元（代替方式）
    static async createCSVBackup() {
        try {
            const tables = ['staffs', 'clients', 'monthly_tasks', 'editing_sessions', 'settings', 'default_tasks', 'app_links'];
            const csvFiles = {};
            
            for (const tableName of tables) {
                console.log(`CSV生成中: ${tableName}`);
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .order('id');
                
                if (error) {
                    console.warn(`${tableName} データ取得エラー:`, error);
                    continue;
                }
                
                if (data && data.length > 0) {
                    // CSVヘッダー生成
                    const headers = Object.keys(data[0]);
                    let csv = headers.map(h => `"${h}"`).join(',') + '\n';
                    
                    // CSV行生成
                    for (const row of data) {
                        const values = headers.map(header => {
                            let value = row[header];
                            if (value === null || value === undefined) {
                                return '';
                            }
                            if (typeof value === 'object') {
                                value = JSON.stringify(value);
                            }
                            return `"${String(value).replace(/"/g, '""')}"`;
                        });
                        csv += values.join(',') + '\n';
                    }
                    
                    csvFiles[tableName] = {
                        csv: csv,
                        count: data.length
                    };
                }
            }
            
            return {
                timestamp: new Date().toISOString(),
                format: 'csv',
                files: csvFiles
            };
            
        } catch (error) {
            console.error('CSV バックアップエラー:', error);
            throw error;
        }
    }

    static async restoreFromCSVBackup(csvBackupData) {
        try {
            if (!csvBackupData.files) {
                throw new Error('無効なCSVバックアップファイルです');
            }
            
            const tables = ['staffs', 'default_tasks', 'settings', 'clients', 'monthly_tasks', 'editing_sessions', 'app_links'];
            const results = {};
            
            // 既存データを安全に削除
            for (const tableName of [...tables].reverse()) {
                if (csvBackupData.files[tableName]) {
                    if (tableName === 'staffs') {
                        await supabase.from('clients').update({ staff_id: null }).not('staff_id', 'is', null);
                    }
                    await supabase.from(tableName).delete().neq('id', -1);
                }
            }
            
            // CSVデータを復元
            for (const tableName of tables) {
                if (csvBackupData.files[tableName]) {
                    console.log(`CSV復元中: ${tableName}`);
                    const csvData = csvBackupData.files[tableName].csv;
                    const lines = csvData.trim().split('\n');
                    
                    if (lines.length < 2) continue;
                    
                    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
                    const rows = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        const values = this.parseCSVRow(lines[i]);
                        const row = {};
                        
                        headers.forEach((header, index) => {
                            let value = values[index] || '';
                            
                            // 型変換
                            if (value === '') {
                                row[header] = null;
                            } else if (header === 'id' || header.includes('_id')) {
                                row[header] = parseInt(value) || null;
                            } else if (header.includes('_month') || header.includes('fiscal_month')) {
                                row[header] = parseInt(value) || null;
                            } else if (header.includes('tasks') || header.includes('custom_tasks') || header.includes('finalized_years')) {
                                try {
                                    row[header] = JSON.parse(value);
                                } catch {
                                    row[header] = value;
                                }
                            } else {
                                row[header] = value;
                            }
                        });
                        
                        rows.push(row);
                    }
                    
                    // バッチでupsert
                    const batchSize = 100;
                    let restoredCount = 0;
                    
                    for (let i = 0; i < rows.length; i += batchSize) {
                        const batch = rows.slice(i, i + batchSize);
                        
                        // テーブルごとのスキーマに応じたupsert設定
                        const tableSchemas = {
                            'settings': { conflict: 'key' },
                            // 他のテーブルはidカラムあり（デフォルト）
                        };
                        const conflictColumn = tableSchemas[tableName]?.conflict || 'id';
                        
                        const { error } = await supabase
                            .from(tableName)
                            .upsert(batch, { onConflict: conflictColumn, ignoreDuplicates: false });
                        
                        if (error) {
                            console.error(`${tableName} CSV復元エラー:`, error);
                        } else {
                            restoredCount += batch.length;
                        }
                    }
                    
                    results[tableName] = { restored: restoredCount };
                    console.log(`${tableName}: ${restoredCount} 件CSV復元完了`);
                }
            }
            
            return results;
            
        } catch (error) {
            console.error('CSV復元エラー:', error);
            throw error;
        }
    }
    
    static parseCSVRow(csvRow) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < csvRow.length; i++) {
            const char = csvRow[i];
            const nextChar = csvRow[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    // 自動バックアップ管理
    static initAutoBackup() {
        const settings = this.getBackupSettings();
        
        if (settings.enabled) {
            console.log('自動バックアップが有効です');
            this.scheduleNextBackup(settings);
        }
    }

    static getBackupSettings() {
        const defaultSettings = {
            enabled: false,
            frequency: 'daily',
            time: '03:00',
            method: 'weekly-rotation',
            path: 'downloads',
            directoryHandle: null,
            selectedPath: ''
        };
        
        const stored = localStorage.getItem('backupSettings');
        return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    }

    static saveBackupSettings(settings) {
        localStorage.setItem('backupSettings', JSON.stringify(settings));
        console.log('バックアップ設定を保存:', settings);
        
        if (settings.enabled) {
            this.scheduleNextBackup(settings);
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
        
        console.log(`次回自動バックアップ: ${nextBackup.toLocaleString()}`);
        
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
            console.log('自動バックアップを実行中...');
            await this.downloadBackup();
            console.log('自動バックアップが完了しました');
            
            // 次回のバックアップをスケジュール
            this.scheduleNextBackup(settings);
        } catch (error) {
            console.error('自動バックアップに失敗しました:', error);
            // エラーが発生してもスケジュールは継続
            setTimeout(() => {
                this.scheduleNextBackup(settings);
            }, 60000); // 1分後に再スケジュール
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