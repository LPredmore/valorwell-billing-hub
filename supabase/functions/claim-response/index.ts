
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

// Get the last response ID from system settings
async function getLastResponseId(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', LAST_RESPONSE_ID_KEY)
      .single();
    
    if (error || !data) {
      console.log('No last response ID found, starting with default of 0');
      return 0; // FIXED: Start with 0 to capture all historical responses
    }
    
    const responseId = parseInt(data.value, 10) || 0;
    console.log(`Retrieved last response ID from settings: ${responseId}`);
    return responseId;
  } catch (err) {
    console.error('Error retrieving last response ID:', err);
    return 0; // FIXED: Default to 0 instead of high number
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

// Try to find a good ResponseID by stepping back from the current one
async function findWorkingResponseId(startingResponseId: number): Promise<{ responseId: number, data: any } | null> {
  const stepSize = 100000; // Step back by 100k each time
  const maxAttempts = 10;
  
  console.log(`Attempting to find working ResponseID starting from: ${startingResponseId}`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const testResponseId = startingResponseId - (stepSize * attempt);
    console.log(`Attempt ${attempt + 1}: Testing ResponseID ${testResponseId}`);
    
    const result = await callClaimMdApi(
      'response', 
      { ResponseID: testResponseId },
      null
    );
    
    if (result.success && result.data) {
      // Check if we got any meaningful data
      const claims = result.data.claims || result.data.claim || [];
      if (Array.isArray(claims) && claims.length > 0) {
        console.log(`Found working ResponseID: ${testResponseId} with ${claims.length} claims`);
        return { responseId: testResponseId, data: result.data };
      } else if (result.data && Object.keys(result.data).length > 0) {
        // Even if no claims, if we got a valid response structure, this might be a good starting point
        console.log(`Found valid ResponseID: ${testResponseId} (no claims but valid response)`);
        return { responseId: testResponseId, data: result.data };
      }
    }
    
    // Add a small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('Could not find a working ResponseID after all attempts');
  return null;
}

// Update appointment claim status based on response
async function updateAppointmentClaimStatus(claimId: string, status: string, responseData: any): Promise<void> {
  try {
    console.log(`Updating claim status for claimId: ${claimId}, status: ${status}`);
    
    // Query the correct field name 'claimid'
    const { data: appointments, error: queryError } = await supabase
      .from('appointments')
      .select('id')
      .eq('claimid', claimId);
    
    if (queryError) {
      console.error(`Error querying appointments for claim ID ${claimId}:`, queryError);
      return;
    }
    
    if (!appointments || appointments.length === 0) {
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

// Check if a response is recent enough to process
function isRecentResponse(responseData: any, lastSuccessfulCheck: string | null): boolean {
  if (!lastSuccessfulCheck) {
    return true; // If no last check, process all responses
  }
  
  const lastCheckDate = new Date(lastSuccessfulCheck);
  const cutoffDate = new Date(lastCheckDate.getTime() - (24 * 60 * 60 * 1000)); // 24 hours before last check
  
  // Try to extract timestamp from response data
  if (responseData.timestamp) {
    const responseDate = new Date(responseData.timestamp);
    return responseDate > cutoffDate;
  }
  
  if (responseData.date) {
    const responseDate = new Date(responseData.date);
    return responseDate > cutoffDate;
  }
  
  // If we can't determine the response date, process it anyway
  return true;
}

// Process response data and update appointments
async function processResponseData(responseData: any, lastSuccessfulCheck: string | null): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  
  console.log('Processing response data:', JSON.stringify(responseData, null, 2));
  
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
  console.log(`Found ${claims.length} claims in response`);
  
  if (!Array.isArray(claims)) {
    console.log('Claims data is not an array:', typeof claims);
    return { updatedCount };
  }
  
  for (const claim of claims) {
    // FIXED: Only use claimid field
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
    
    // Get the current last response ID and last successful check
    const lastResponseId = await getLastResponseId();
    const lastSuccessfulCheck = await getLastSuccessfulCheck();
    
    console.log(`Starting claim response retrieval with last ResponseID: ${lastResponseId}`);
    console.log(`Last successful check: ${lastSuccessfulCheck || 'Never'}`);
    
    // Try with the stored ResponseID first
    let result = await callClaimMdApi(
      'response', 
      { ResponseID: lastResponseId },
      null
    );
    
    let workingResponseId = lastResponseId;
    let responseData = null;
    
    if (!result.success) {
      console.error('First API call failed:', result.error);
      
      // Try to find a working ResponseID
      const workingResult = await findWorkingResponseId(lastResponseId);
      if (workingResult) {
        workingResponseId = workingResult.responseId;
        responseData = workingResult.data;
        result = { success: true, data: responseData };
        console.log(`Found working ResponseID: ${workingResponseId}`);
      } else {
        // Final fallback to ResponseID=0
        console.log('Trying final fallback with ResponseID=0');
        result = await callClaimMdApi('response', { ResponseID: 0 }, null);
        workingResponseId = 0;
      }
      
      if (!result.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to retrieve claim responses after all attempts', 
            details: result.error 
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
        );
      }
    } else {
      responseData = result.data;
    }
    
    console.log('API call successful, processing response data');
    
    // Process the response data to update appointment statuses
    const { updatedCount } = await processResponseData(responseData, lastSuccessfulCheck);
    
    // Update the last response ID if we found a new working one or if provided in the API response
    let newLastResponseId = workingResponseId;
    if (responseData && responseData.last_responseid) {
      newLastResponseId = responseData.last_responseid;
    }
    
    // Only update the stored ResponseID if we processed some claims or found a better one
    if (updatedCount > 0 || workingResponseId !== lastResponseId) {
      await updateLastResponseId(newLastResponseId);
    }
    
    // Update the last successful check timestamp if we processed any claims
    if (updatedCount > 0) {
      await updateLastSuccessfulCheck();
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
        message,
        debugInfo: {
          originalResponseId: lastResponseId,
          workingResponseId: workingResponseId,
          foundNewData: updatedCount > 0,
          lastSuccessfulCheck: lastSuccessfulCheck
        }
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
