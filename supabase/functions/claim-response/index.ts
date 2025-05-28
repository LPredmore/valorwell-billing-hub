
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
    
    const responseId = parseInt(data.value, 10) || 0;
    console.log(`Retrieved last response ID from settings: ${responseId}`);
    return responseId;
  } catch (err) {
    console.error('Error retrieving last response ID:', err);
    return 0;
  }
}

// Update the last response ID in system settings
async function updateLastResponseId(responseId: number): Promise<void> {
  try {
    console.log(`Updating last response ID to: ${responseId}`);
    const { error } = await supabase
      .from('system_settings')
      .upsert({ 
        key: LAST_RESPONSE_ID_KEY, 
        value: responseId.toString(),
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error updating last response ID:', error);
    } else {
      console.log(`Successfully updated last response ID to: ${responseId}`);
    }
  } catch (err) {
    console.error('Failed to update last response ID:', err);
  }
}

// Update appointment claim status based on response
async function updateAppointmentClaimStatus(claimId: string, status: string, responseData: any): Promise<void> {
  try {
    console.log(`Updating claim status for claimId: ${claimId}, status: ${status}`);
    
    const { data: appointments, error: queryError } = await supabase
      .from('appointments')
      .select('id')
      .eq('claim_claimmd_id', claimId);
    
    if (queryError || !appointments.length) {
      console.log(`No appointment found with claim ID ${claimId}`);
      return;
    }
    
    const appointmentId = appointments[0].id;
    console.log(`Found appointment ${appointmentId} for claim ${claimId}`);
    
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
    } else {
      console.log(`Successfully updated appointment ${appointmentId} with status: ${status}`);
    }
  } catch (err) {
    console.error('Failed to update appointment claim status:', err);
  }
}

// Process response data and update appointments
async function processResponseData(responseData: any): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  
  console.log('Processing response data:', JSON.stringify(responseData, null, 2));
  
  if (!responseData) {
    console.log('No response data to process');
    return { updatedCount };
  }
  
  // Check different possible response structures
  const claims = responseData.claims || responseData.claim || [];
  console.log(`Found ${claims.length} claims in response`);
  
  if (!Array.isArray(claims)) {
    console.log('Claims data is not an array:', typeof claims);
    return { updatedCount };
  }
  
  for (const claim of claims) {
    if (!claim.claimid && !claim.claimmd_id) {
      console.log('Skipping claim without ID:', claim);
      continue;
    }
    
    const claimId = claim.claimid || claim.claimmd_id;
    console.log(`Processing claim: ${claimId}`);
    
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
    } else if (claim.messages && Array.isArray(claim.messages) && claim.messages.length > 0) {
      // Check for rejection messages
      const rejectionMessages = claim.messages.filter(msg => msg.status === 'R');
      if (rejectionMessages.length > 0) {
        status = `Rejected - ${rejectionMessages.length} error(s)`;
      }
    }
    
    console.log(`Determined status for claim ${claimId}: ${status}`);
    
    // Update the appointment with the claim status
    await updateAppointmentClaimStatus(claimId, status, claim);
    updatedCount++;
  }
  
  console.log(`Processed ${updatedCount} claims total`);
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
    console.log(`Starting claim response retrieval with last ResponseID: ${lastResponseId}`);
    
    // Try with the stored ResponseID first
    let result = await callClaimMdApi(
      'response', 
      { ResponseID: lastResponseId },
      null // No client ID association for this operation
    );
    
    if (!result.success) {
      console.error('First API call failed, trying with ResponseID=0');
      
      // If that fails, try with ResponseID=0 to get all responses
      result = await callClaimMdApi(
        'response', 
        { ResponseID: 0 },
        null
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
    }
    
    console.log('API call successful, processing response data');
    
    // Process the response data to update appointment statuses
    const { updatedCount } = await processResponseData(result.data);
    
    // Update the last response ID if provided in the API response
    let newLastResponseId = lastResponseId;
    if (result.data && result.data.last_responseid) {
      newLastResponseId = result.data.last_responseid;
      await updateLastResponseId(newLastResponseId);
    }
    
    const message = updatedCount > 0 
      ? `Successfully retrieved and processed ${updatedCount} claim status updates`
      : 'No new claim status updates found';
    
    console.log(message);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        updatedCount,
        lastResponseId: newLastResponseId,
        message
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
