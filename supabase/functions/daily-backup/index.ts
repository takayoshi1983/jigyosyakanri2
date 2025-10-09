import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 Daily backup function started')

    // Initialize Supabase client using reserved environment variables
    const supabaseUrl = `https://jhjexgkzzbzxhhlezaoa.supabase.co`
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get Japan time for filename
    const japanTime = new Date(new Date().getTime() + (9 * 60 * 60 * 1000))
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayName = dayNames[japanTime.getDay()]
    
    console.log(`📅 Creating backup for ${dayName} (Japan time: ${japanTime.toISOString()})`)

    // Create full backup data
    const backupData = {
      timestamp: japanTime.toISOString(),
      version: '1.0',
      database: 'jigyosya-management',
      tables: {}
    }

    // Define tables to backup
    const tables = ['clients', 'staffs', 'monthly_tasks', 'editing_sessions', 'settings', 'default_tasks', 'app_links']
    let totalRecords = 0

    // Fetch data from each table
    for (const tableName of tables) {
      console.log(`📊 Backing up table: ${tableName}`)
      
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
      
      if (error) {
        console.error(`❌ Error fetching ${tableName}:`, error)
        throw error
      }
      
      backupData.tables[tableName] = data || []
      const recordCount = data?.length || 0
      totalRecords += recordCount
      console.log(`✅ ${tableName}: ${recordCount} records`)
    }

    console.log(`📈 Total records: ${totalRecords}`)

    // Upload to Supabase Storage with weekly rotation
    const fileName = `weekly/${dayName}/jigyosya-backup-${dayName}.json`
    const fileContent = JSON.stringify(backupData, null, 2)
    
    console.log(`☁️ Uploading backup to: ${fileName}`)
    console.log(`📦 Backup size: ${Math.round(fileContent.length / 1024)} KB`)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('backups')
      .upload(fileName, fileContent, {
        contentType: 'application/json',
        upsert: true // Overwrite existing file for weekly rotation
      })

    if (uploadError) {
      console.error('❌ Upload error:', uploadError)
      throw uploadError
    }

    // Create backup report
    const reportData = {
      timestamp: japanTime.toISOString(),
      backupFileName: fileName,
      totalRecords,
      tableStats: Object.entries(backupData.tables).map(([name, records]: [string, any]) => ({
        table: name,
        records: Array.isArray(records) ? records.length : 0
      })),
      fileSizeKB: Math.round(fileContent.length / 1024),
      status: 'success'
    }

    // Upload report file
    const reportFileName = `weekly/${dayName}/jigyosya-backup-report-${dayName}.json`
    const { error: reportError } = await supabase.storage
      .from('backups')
      .upload(reportFileName, JSON.stringify(reportData, null, 2), {
        contentType: 'application/json',
        upsert: true
      })

    if (reportError) {
      console.warn('⚠️ Report upload warning:', reportError)
      // Don't fail the entire backup for report issues
    }

    const result = {
      success: true,
      message: `Daily backup completed successfully`,
      details: {
        fileName,
        totalRecords,
        fileSizeKB: reportData.fileSizeKB,
        timestamp: japanTime.toISOString(),
        dayOfWeek: dayName
      }
    }

    // backup_history テーブルに記録
    try {
      const { error: historyError } = await supabase
        .from('backup_history')
        .insert({
          backup_date: japanTime.toISOString(),
          backup_type: 'auto',
          status: 'completed',
          file_name: fileName,
          file_size_kb: reportData.fileSizeKB,
          total_records: totalRecords,
          error_message: null
        })
      
      if (historyError) {
        console.warn('⚠️ Backup history insert warning:', historyError)
        // Don't fail the entire backup for history issues
      } else {
        console.log('📝 Backup history recorded successfully')
      }
    } catch (historyErr) {
      console.warn('⚠️ Backup history error:', historyErr)
    }

    console.log('🎉 Daily backup completed successfully:', result)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('💥 Daily backup error:', error)
    
    const errorResult = {
      success: false,
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }

    return new Response(JSON.stringify(errorResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})