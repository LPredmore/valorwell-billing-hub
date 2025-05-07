
// Edge function to retrieve claim status updates from Claim.MD

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { callClaimMdApi } from '../shared/claimmd-api.ts';

// Define CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Settings key for storing the last response ID
const LAST_RESPONSE_ID_KEY = 'claim_md_last_response_id';

// Get the last response ID from system settings
async function getLastResponseId(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', LAST_RESPONSE_ID_KEY)
      .single();
    
    if (error || !data) {
      console.log('No last response ID found, defaulting to 0');
      return 0;
    }
    
    return parseInt(data.value, 10) || 0;
  } catch (err) {
    console.error('Error retrieving last response ID:', err);
    return 0;
  }
}

// Update the last response ID in system settings
async function updateLastResponseId(responseId: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ 
        key: LAST_RESPONSE_ID_KEY, 
        value: responseId.toString(),
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error updating last response ID:', error);
    }
  } catch (err) {
    console.error('Failed to update last response ID:', err);
  }
}

// Update appointment claim status based on response
async function updateAppointmentClaimStatus(claimId: string, status: string, responseData: any): Promise<void> {
  try {
    const { data: appointments, error: queryError } = await supabase
      .from('appointments')
      .select('id')
      .eq('claim_claimmd_id', claimId);
    
    if (queryError || !appointments.length) {
      console.log(`No appointment found with claim ID ${claimId}`);
      return;
    }
    
    const appointmentId = appointments[0].id;
    
    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        claim_status: status,
        claim_status_last_checked: new Date().toISOString(),
        claim_response_json: responseData,
        requires_billing_review: status.toLowerCase().includes('reject') || 
                                status.toLowerCase().includes('denied') || 
                                status.toLowerCase().includes('error')
      })
      .eq('id', appointmentId);
    
    if (updateError) {
      console.error(`Error updating appointment ${appointmentId} status:`, updateError);
    }
  } catch (err) {
    console.error('Failed to update appointment claim status:', err);
  }
}

// Process response data and update appointments
async function processResponseData(responseData: any): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  
  if (!responseData || !responseData.claims) {
    return { updatedCount };
  }
  
  for (const claim of responseData.claims) {
    if (!claim.claimid) continue;
    
    // Extract status from the claim response
    let status = 'Status Update Received';
    
    // Determine status based on common response patterns
    if (claim.status) {
      status = claim.status;
    } else if (claim.acknowledgement && claim.acknowledgement.toLowerCase() === 'rejected') {
      status = 'Rejected by Clearinghouse';
      if (claim.reason) status += ` - ${claim.reason}`;
    } else if (claim.acknowledgement && claim.acknowledgement.toLowerCase() === 'acknowledged') {
      status = 'Accepted by Clearinghouse';
    } else if (claim.error) {
      status = `Error - ${claim.error}`;
    }
    
    // Update the appointment with the claim status
    await updateAppointmentClaimStatus(claim.claimid, status, claim);
    updatedCount++;
  }
  
  return { updatedCount };
}

// Handle all requests to this function
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Only allow POST requests for claim response retrieval
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method Not Allowed' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
      );
    }
    
    // Get the current last response ID
    const lastResponseId = await getLastResponseId();
    console.log(`Retrieving claim responses since ID: ${lastResponseId}`);
    
    // Call the Claim.MD API to get responses
    const result = await callClaimMdApi(
      'response', 
      { ResponseID: lastResponseId },
      null // No client ID association for this operation
    );
    
    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to retrieve claim responses', 
          details: result.error 
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Process the response data to update appointment statuses
    const { updatedCount } = await processResponseData(result.data);
    
    // Update the last response ID if provided in the API response
    if (result.data && result.data.last_responseid) {
      await updateLastResponseId(result.data.last_responseid);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        updatedCount,
        lastResponseId: result.data?.last_responseid || lastResponseId,
        message: `Successfully retrieved and processed ${updatedCount} claim status updates`
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
    
  } catch (err) {
    console.error('Unexpected error in claim-response function:', err);
    
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
