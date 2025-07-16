import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Setting up cron jobs for batch automation...');

    // Create cron jobs using pg_cron extension
    const cronJobs = [
      {
        name: 'daily-batch-submission',
        schedule: '0 2 * * *', // Daily at 2:00 AM
        sql: `
          SELECT net.http_post(
            url := '${Deno.env.get('SUPABASE_URL')}/functions/v1/batch-automation',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}"}'::jsonb,
            body := '{"operation": "daily_submission"}'::jsonb
          ) as request_id;
        `
      },
      {
        name: 'hourly-status-poll',
        schedule: '0 * * * *', // Every hour
        sql: `
          SELECT net.http_post(
            url := '${Deno.env.get('SUPABASE_URL')}/functions/v1/batch-automation',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}"}'::jsonb,
            body := '{"operation": "status_poll"}'::jsonb
          ) as request_id;
        `
      },
      {
        name: 'weekly-cleanup',
        schedule: '0 3 * * 0', // Weekly on Sunday at 3:00 AM
        sql: `
          SELECT net.http_post(
            url := '${Deno.env.get('SUPABASE_URL')}/functions/v1/batch-automation',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}"}'::jsonb,
            body := '{"operation": "cleanup"}'::jsonb
          ) as request_id;
        `
      }
    ];

    const results = [];

    for (const job of cronJobs) {
      try {
        // First, try to unschedule existing job
        await supabaseClient.rpc('cron.unschedule', { job_name: job.name });
        
        // Then schedule the new job
        const { data, error } = await supabaseClient.rpc('cron.schedule', {
          job_name: job.name,
          cron_schedule: job.schedule,
          command: job.sql
        });

        if (error) {
          console.error(`Error scheduling ${job.name}:`, error);
          results.push({
            job: job.name,
            success: false,
            error: error.message
          });
        } else {
          console.log(`Successfully scheduled ${job.name}`);
          results.push({
            job: job.name,
            success: true,
            schedule: job.schedule
          });
        }
      } catch (error) {
        console.error(`Error with job ${job.name}:`, error);
        results.push({
          job: job.name,
          success: false,
          error: error.message
        });
      }
    }

    // Update schedule statuses in database
    for (const result of results) {
      if (result.success) {
        await supabaseClient
          .from('automated_batch_schedules')
          .update({ 
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('schedule_name', result.job.replace('-', '_'));
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Cron jobs setup completed',
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error setting up cron jobs:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});