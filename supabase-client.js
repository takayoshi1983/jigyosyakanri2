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
            .eq('status', 'active')
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
    
    // スタッフ関連
    static async getStaffs() {
        const { data, error } = await supabase
            .from('staffs')
            .select('*')
            .order('id');
            
        if (error) throw error;
        return data;
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
        const { data, error } = await supabase
            .from('default_tasks')
            .upsert({
                accounting_method: accountingMethod,
                tasks: JSON.stringify(tasks),
                task_name: `${accountingMethod}セット`,
                display_order: accountingMethod === '記帳代行' ? 999 : 998,
                is_active: true
            }, {
                onConflict: 'accounting_method'
            })
            .select()
            .single();
            
        if (error) throw error;
        return data;
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
                if (id && !isNaN(parseInt(id))) {
                    const numId = parseInt(id);
                    
                    if (existingIds.has(numId)) {
                        // 既存データの更新
                        toUpdate.push({ id: numId, ...clientData });
                    } else {
                        errors.push(`行 ${i + 1}: ID ${numId} は存在しません（IDの変更は不可）`);
                        continue;
                    }
                } else {
                    // 新規追加（IDなしまたは無効なID）
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
                        '領収書整理', '仕訳入力', '試算表作成', '給与計算',
                        '売上管理', '支払管理', '資金繰り表', '月次レポート'
                    ]),
                    display_order: 1,
                    is_active: true
                },
                {
                    task_name: '自計デフォルト',
                    accounting_method: '自計',
                    tasks: JSON.stringify([
                        '試算表確認', '仕訳チェック', '決算準備', '税務申告',
                        '資料整理', '相談対応', '改善提案', 'レビュー'
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
}

// エラーハンドリング用ヘルパー
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