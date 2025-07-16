import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchAutomationRequest {
  operation: 'daily_submission' | 'status_poll' | 'cleanup' | 'schedule_management';
  scheduleId?: string;
  force?: boolean;
}

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

    const body = await req.json() as BatchAutomationRequest;
    console.log('Batch automation request:', body);

    switch (body.operation) {
      case 'daily_submission':
        return await handleDailySubmission(supabaseClient, body.force);
      case 'status_poll':
        return await handleStatusPoll(supabaseClient);
      case 'cleanup':
        return await handleCleanup(supabaseClient);
      case 'schedule_management':
        return await handleScheduleManagement(supabaseClient, body.scheduleId);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid operation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in batch automation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleDailySubmission(supabaseClient: any, force = false): Promise<Response> {
  console.log('Starting daily batch submission...');
  const startTime = Date.now();

  try {
    // Get pending claims
    const { data: pendingClaims, error: claimsError } = await supabaseClient
      .from('CMS1500_claims')
      .select('*')
      .eq('batch_status', 'pending')
      .is('claim_md_batch_id', null);

    if (claimsError) throw claimsError;

    if (!pendingClaims || pendingClaims.length === 0) {
      console.log('No pending claims found for batch submission');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending claims found',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call batch submission function
    const { data: batchResult, error: batchError } = await supabaseClient.functions.invoke(
      'claim-batch-submission',
      {
        body: {
          operation: 'upload',
          claimIds: pendingClaims.map((c: any) => c.id),
          automated: true
        }
      }
    );

    if (batchError) throw batchError;

    const processingTime = Math.round((Date.now() - startTime) / 1000 / 60); // minutes

    // Update performance metrics
    const successfulClaims = batchResult?.successfulClaims || 0;
    const failedClaims = pendingClaims.length - successfulClaims;

    await supabaseClient.rpc('update_batch_performance_metrics', {
      p_batch_date: new Date().toISOString().split('T')[0],
      p_total_claims: pendingClaims.length,
      p_successful_claims: successfulClaims,
      p_failed_claims: failedClaims,
      p_processing_time_minutes: processingTime,
      p_average_response_time_ms: batchResult?.averageResponseTime || 0
    });

    // Update schedule run time
    await updateScheduleRunTime(supabaseClient, 'daily_batch_submission');

    // Send alerts if error rate is high
    const errorRate = (failedClaims / pendingClaims.length) * 100;
    if (errorRate > 20) {
      await sendAlert(supabaseClient, 'high_error_rate', {
        errorRate,
        totalClaims: pendingClaims.length,
        failedClaims
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        batchId: batchResult?.batchId,
        processed: pendingClaims.length,
        successful: successfulClaims,
        failed: failedClaims,
        processingTimeMinutes: processingTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in daily submission:', error);
    
    // Log critical error
    await supabaseClient
      .from('api_logs')
      .insert({
        endpoint: 'batch-automation/daily_submission',
        status: 'error',
        error_message: error.message,
        error_category: 'system_error',
        error_severity: 'critical'
      });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleStatusPoll(supabaseClient: any): Promise<Response> {
  console.log('Starting status poll...');

  try {
    // Get claims with batch IDs that need status updates
    const { data: submittedClaims, error: claimsError } = await supabaseClient
      .from('CMS1500_claims')
      .select('*')
      .not('claim_md_batch_id', 'is', null)
      .in('status', ['submitted', 'pending_response']);

    if (claimsError) throw claimsError;

    if (!submittedClaims || submittedClaims.length === 0) {
      console.log('No submitted claims found for status polling');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No submitted claims found',
          polled: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by batch ID for efficient polling
    const batchIds = [...new Set(submittedClaims.map((c: any) => c.claim_md_batch_id))];
    let totalUpdated = 0;

    for (const batchId of batchIds) {
      try {
        // Fetch responses for this batch
        const { data: responseResult, error: responseError } = await supabaseClient.functions.invoke(
          'claim-batch-submission',
          {
            body: {
              operation: 'responses',
              batchId,
              automated: true
            }
          }
        );

        if (responseError) {
          console.error(`Error fetching responses for batch ${batchId}:`, responseError);
          continue;
        }

        totalUpdated += responseResult?.updated || 0;
      } catch (error) {
        console.error(`Error processing batch ${batchId}:`, error);
      }
    }

    // Update schedule run time
    await updateScheduleRunTime(supabaseClient, 'hourly_status_poll');

    return new Response(
      JSON.stringify({ 
        success: true, 
        batchesPolled: batchIds.length,
        claimsUpdated: totalUpdated
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in status poll:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleCleanup(supabaseClient: any): Promise<Response> {
  console.log('Starting weekly cleanup...');

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

    // Archive old batch logs
    const { data: oldLogs, error: logsError } = await supabaseClient
      .from('batch_logs')
      .select('*')
      .lt('created_at', cutoffDate.toISOString());

    if (logsError) throw logsError;

    let archivedCount = 0;
    if (oldLogs && oldLogs.length > 0) {
      // In a real implementation, you would move these to an archive table
      // For now, we'll just delete them after logging
      console.log(`Found ${oldLogs.length} old batch logs to archive`);
      
      // Delete old logs (in production, move to archive first)
      const { error: deleteError } = await supabaseClient
        .from('batch_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (!deleteError) {
        archivedCount = oldLogs.length;
      }
    }

    // Clean up old API logs
    const { error: apiLogsError } = await supabaseClient
      .from('api_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (apiLogsError) {
      console.error('Error cleaning up API logs:', apiLogsError);
    }

    // Update schedule run time
    await updateScheduleRunTime(supabaseClient, 'weekly_cleanup');

    return new Response(
      JSON.stringify({ 
        success: true, 
        archivedBatchLogs: archivedCount,
        message: 'Cleanup completed successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cleanup:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleScheduleManagement(supabaseClient: any, scheduleId?: string): Promise<Response> {
  try {
    if (scheduleId) {
      // Get specific schedule info
      const { data: schedule, error } = await supabaseClient
        .from('automated_batch_schedules')
        .select('*')
        .eq('id', scheduleId)
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, schedule }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Get all schedules
      const { data: schedules, error } = await supabaseClient
        .from('automated_batch_schedules')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, schedules }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in schedule management:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function updateScheduleRunTime(supabaseClient: any, scheduleName: string) {
  const now = new Date();
  await supabaseClient
    .from('automated_batch_schedules')
    .update({
      last_run_at: now.toISOString(),
      run_count: supabaseClient.raw('run_count + 1'),
      updated_at: now.toISOString()
    })
    .eq('schedule_name', scheduleName);
}

async function sendAlert(supabaseClient: any, alertType: string, data: any) {
  // Log alert to database
  await supabaseClient
    .from('api_logs')
    .insert({
      endpoint: 'batch-automation/alert',
      status: 'alert',
      error_message: `${alertType}: ${JSON.stringify(data)}`,
      error_category: 'system_error',
      error_severity: 'high',
      request_payload: data
    });

  // In a real implementation, send email/SMS here
  console.log(`ALERT [${alertType}]:`, data);
}