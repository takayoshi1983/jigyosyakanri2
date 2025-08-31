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
        const { data, error } = await supabase
            .from('monthly_tasks')
            .select('*')
            .eq('client_id', clientId)
            .eq('month', month)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
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
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();
            
        if (error) {
            console.warn(`Setting '${key}' not found:`, error);
            return null;
        }
        return data?.value;
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