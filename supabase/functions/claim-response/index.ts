
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

// Settings keys for storing the last response ID and last successful check
const LAST_RESPONSE_ID_KEY = 'claim_md_last_response_id';
const LAST_SUCCESSFUL_CHECK_KEY = 'claim_md_last_successful_check';

// FORCE RESET ResponseID to 0 to capture all historical data
async function forceResetResponseId(): Promise<void> {
  try {
    console.log('=== FORCE RESETTING ResponseID to 0 ===');
    const { error } = await supabase
      .from('system_settings')
      .upsert({ 
        key: LAST_RESPONSE_ID_KEY, 
        value: '0',
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('ERROR: Failed to force reset ResponseID:', error);
    } else {
      console.log('SUCCESS: Force reset ResponseID to 0');
    }
  } catch (err) {
    console.error('EXCEPTION: Failed to force reset ResponseID:', err);
  }
}

// Get the last response ID from system settings
async function getLastResponseId(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', LAST_RESPONSE_ID_KEY)
      .single();
    
    if (error || !data) {
      console.log('No last response ID found, using default of 0');
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

// Get the last successful check timestamp
async function getLastSuccessfulCheck(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', LAST_SUCCESSFUL_CHECK_KEY)
      .single();
    
    if (error || !data) {
      console.log('No last successful check timestamp found');
      return null;
    }
    
    console.log(`Last successful check: ${data.value}`);
    return data.value;
  } catch (err) {
    console.error('Error retrieving last successful check:', err);
    return null;
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

// Update the last successful check timestamp
async function updateLastSuccessfulCheck(): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`Updating last successful check to: ${timestamp}`);
    
    const { error } = await supabase
      .from('system_settings')
      .upsert({ 
        key: LAST_SUCCESSFUL_CHECK_KEY, 
        value: timestamp,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error updating last successful check:', error);
    } else {
      console.log(`Successfully updated last successful check to: ${timestamp}`);
    }
  } catch (err) {
    console.error('Failed to update last successful check:', err);
  }
}

// Update appointment claim status based on response
async function updateAppointmentClaimStatus(claimId: string, status: string, responseData: any): Promise<void> {
  try {
    console.log(`=== UPDATING CLAIM STATUS ===`);
    console.log(`  Claim ID: ${claimId}`);
    console.log(`  New Status: ${status}`);
    
    // Query using the correct field name 'claimid'
    const { data: appointments, error: queryError } = await supabase
      .from('appointments')
      .select('id')
      .eq('claimid', claimId);
    
    if (queryError) {
      console.error(`ERROR querying appointments for claim ID ${claimId}:`, queryError);
      return;
    }
    
    console.log(`  Query result: Found ${appointments?.length || 0} appointments`);
    
    if (!appointments || appointments.length === 0) {
      console.log(`  WARNING: No appointment found with claim ID ${claimId}`);
      return;
    }
    
    const appointmentId = appointments[0].id;
    console.log(`  Found appointment ${appointmentId} for claim ${claimId}`);
    
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
      console.error(`ERROR updating appointment ${appointmentId} status:`, updateError);
    } else {
      console.log(`SUCCESS: Updated appointment ${appointmentId} with status: ${status}`);
    }
  } catch (err) {
    console.error('EXCEPTION in updateAppointmentClaimStatus:', err);
  }
}

// Check if a response is recent enough to process
function isRecentResponse(responseData: any, lastSuccessfulCheck: string | null): boolean {
  if (!lastSuccessfulCheck) {
    console.log('No last check timestamp - processing all responses');
    return true;
  }
  
  const lastCheckDate = new Date(lastSuccessfulCheck);
  const cutoffDate = new Date(lastCheckDate.getTime() - (24 * 60 * 60 * 1000)); // 24 hours before last check
  
  // Try to extract timestamp from response data
  if (responseData.timestamp) {
    const responseDate = new Date(responseData.timestamp);
    const isRecent = responseDate > cutoffDate;
    console.log(`Response timestamp: ${responseData.timestamp}, Recent: ${isRecent}`);
    return isRecent;
  }
  
  if (responseData.date) {
    const responseDate = new Date(responseData.date);
    const isRecent = responseDate > cutoffDate;
    console.log(`Response date: ${responseData.date}, Recent: ${isRecent}`);
    return isRecent;
  }
  
  console.log('Could not determine response date - processing anyway');
  return true;
}

// Process response data and update appointments
async function processResponseData(responseData: any, lastSuccessfulCheck: string | null): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  
  console.log('=== PROCESSING RESPONSE DATA ===');
  console.log('Full response structure:', JSON.stringify(responseData, null, 2));
  
  if (!responseData) {
    console.log('No response data to process');
    return { updatedCount };
  }
  
  // Check if this response is recent enough to process
  if (!isRecentResponse(responseData, lastSuccessfulCheck)) {
    console.log('Response is too old, skipping processing');
    return { updatedCount };
  }
  
  // Check different possible response structures
  const claims = responseData.claims || responseData.claim || [];
  console.log(`Found ${Array.isArray(claims) ? claims.length : 'non-array'} claims in response`);
  console.log('Claims data type:', typeof claims);
  console.log('Claims data:', JSON.stringify(claims, null, 2));
  
  if (!Array.isArray(claims)) {
    console.log('Claims data is not an array - checking if single claim object');
    if (claims && typeof claims === 'object' && claims.claimid) {
      console.log('Found single claim object, processing as array of one');
      return await processResponseData({ claims: [claims] }, lastSuccessfulCheck);
    }
    console.log('No valid claims structure found');
    return { updatedCount };
  }
  
  for (const claim of claims) {
    console.log(`=== PROCESSING INDIVIDUAL CLAIM ===`);
    console.log('Claim object:', JSON.stringify(claim, null, 2));
    
    // Only use claimid field
    if (!claim.claimid) {
      console.log('Skipping claim without claimid:', claim);
      continue;
    }
    
    const claimId = claim.claimid;
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
  
  console.log(`=== PROCESSING COMPLETE ===`);
  console.log(`Total claims processed: ${updatedCount}`);
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
    
    console.log('=== CLAIM RESPONSE RETRIEVAL STARTED ===');
    
    // FORCE RESET ResponseID to 0 for debugging
    await forceResetResponseId();
    
    // Get the current last response ID and last successful check
    const lastResponseId = await getLastResponseId();
    const lastSuccessfulCheck = await getLastSuccessfulCheck();
    
    console.log(`Starting claim response retrieval with ResponseID: ${lastResponseId}`);
    console.log(`Last successful check: ${lastSuccessfulCheck || 'Never'}`);
    
    // Call Claim.MD API with the ResponseID
    console.log(`=== CALLING CLAIM.MD API ===`);
    const result = await callClaimMdApi(
      'response', 
      { ResponseID: lastResponseId },
      null
    );
    
    console.log(`API call result - Success: ${result.success}`);
    
    if (!result.success) {
      console.error('=== API CALL FAILED ===');
      console.error('Error details:', result.error);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to retrieve claim responses', 
          details: result.error,
          debugInfo: {
            lastResponseId: lastResponseId,
            lastSuccessfulCheck: lastSuccessfulCheck
          }
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    const responseData = result.data;
    console.log('=== API CALL SUCCESSFUL ===');
    console.log('Response data received:', JSON.stringify(responseData, null, 2));
    
    // Process the response data to update appointment statuses
    const { updatedCount } = await processResponseData(responseData, lastSuccessfulCheck);
    
    // Update the last response ID if provided in the API response
    let newLastResponseId = lastResponseId;
    if (responseData && responseData.last_responseid) {
      newLastResponseId = responseData.last_responseid;
      console.log(`New ResponseID from API: ${newLastResponseId}`);
    } else {
      // If we processed claims, increment the ResponseID for next time
      if (updatedCount > 0) {
        newLastResponseId = lastResponseId + 1;
        console.log(`Incrementing ResponseID to: ${newLastResponseId}`);
      }
    }
    
    // Update the stored ResponseID if we processed claims or got a new one
    if (updatedCount > 0 || newLastResponseId !== lastResponseId) {
      await updateLastResponseId(newLastResponseId);
    }
    
    // Update the last successful check timestamp if we processed any claims
    if (updatedCount > 0) {
      await updateLastSuccessfulCheck();
    }
    
    const message = updatedCount > 0 
      ? `Successfully retrieved and processed ${updatedCount} claim status updates`
      : 'No new claim status updates found';
    
    console.log('=== FINAL RESULT ===');
    console.log(message);
    console.log(`Original ResponseID: ${lastResponseId}`);
    console.log(`New ResponseID: ${newLastResponseId}`);
    console.log(`Claims updated: ${updatedCount}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        updatedCount,
        lastResponseId: newLastResponseId,
        message,
        debugInfo: {
          originalResponseId: lastResponseId,
          newResponseId: newLastResponseId,
          foundNewData: updatedCount > 0,
          lastSuccessfulCheck: lastSuccessfulCheck,
          rawResponseData: responseData
        }
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
    
  } catch (err) {
    console.error('=== UNEXPECTED ERROR ===');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message,
        stack: err.stack
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
