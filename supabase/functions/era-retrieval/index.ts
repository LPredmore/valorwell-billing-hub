
// Edge function to retrieve and process ERA files from Claim.MD

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

// Settings key for storing the last ERA check date
const LAST_ERA_CHECK_KEY = 'claim_md_last_era_check';

// Format date from YYYY-MM-DD to MM-DD-YYYY as required by Claim.MD API
function formatClaimMdDateString(dateString: string): string {
  if (!dateString) return '';
  // Split the ISO date format (YYYY-MM-DD)
  const [year, month, day] = dateString.split('-');
  // Return in MM-DD-YYYY format
  return `${month}-${day}-${year}`;
}

// Get the last ERA check date from system settings
async function getLastEraCheck(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', LAST_ERA_CHECK_KEY)
      .single();
    
    if (error || !data) {
      console.error('Error retrieving last ERA check date:', error);
      // Default to 30 days ago if no date is found
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    return data.value;
  } catch (err) {
    console.error('Error retrieving last ERA check date:', err);
    // Default to 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString().split('T')[0];
  }
}

// Update the last ERA check date in system settings
async function updateLastEraCheck(): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ 
        key: LAST_ERA_CHECK_KEY, 
        value: today,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error updating last ERA check date:', error);
    }
  } catch (err) {
    console.error('Failed to update last ERA check date:', err);
  }
}

// Find appointment by Claim.MD claim ID
async function findAppointmentByClaimId(claimId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('id')
      .eq('claim_claimmd_id', claimId)
      .single();
    
    if (error || !data) {
      console.log(`No appointment found with claim ID ${claimId}`);
      return null;
    }
    
    return data.id;
  } catch (err) {
    console.error(`Error finding appointment for claim ID ${claimId}:`, err);
    return null;
  }
}

// Update appointment with ERA payment data
async function updateAppointmentWithEraData(appointmentId: string, paymentData: any): Promise<void> {
  try {
    const updateData: Record<string, any> = {
      era_claimmd_id: paymentData.eraId || paymentData.era_id || paymentData.claimId || paymentData.claim_id,
      claim_status: 'Payment Received',
      claim_status_last_checked: new Date().toISOString()
    };
    
    // Add payment info if available
    if (paymentData.paidAmount || paymentData.paid_amount) {
      updateData.insurance_paid_amount = parseFloat(paymentData.paidAmount || paymentData.paid_amount);
    }
    
    // Add adjustment info if available
    if (paymentData.adjustmentAmount || paymentData.adjustment_amount) {
      updateData.insurance_adjustment_amount = parseFloat(paymentData.adjustmentAmount || paymentData.adjustment_amount);
    }
    
    // Add detailed adjustment info if available
    if (paymentData.adjustments) {
      updateData.insurance_adjustment_details_json = paymentData.adjustments;
    }
    
    // Add patient responsibility if available
    if (paymentData.patientResponsibility || paymentData.patient_responsibility) {
      updateData.patient_responsibility_amount = parseFloat(paymentData.patientResponsibility || paymentData.patient_responsibility);
    }
    
    // Add payment date if available
    if (paymentData.paymentDate || paymentData.payment_date) {
      updateData.era_payment_date = paymentData.paymentDate || paymentData.payment_date;
    }
    
    // Add check/EFT number if available
    if (paymentData.checkNumber || paymentData.check_number || paymentData.eftNumber || paymentData.eft_number) {
      updateData.era_check_eft_number = paymentData.checkNumber || paymentData.check_number || 
                                      paymentData.eftNumber || paymentData.eft_number;
    }
    
    // Handle denial
    if (paymentData.denied) {
      updateData.claim_status = 'Denied';
      updateData.denial_details_json = paymentData.denialReasons || paymentData.denial_reasons;
      updateData.requires_billing_review = true;
    }
    
    // Update the appointment
    const { error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId);
    
    if (error) {
      console.error(`Error updating ERA data for appointment ${appointmentId}:`, error);
    } else {
      console.log(`Successfully updated appointment ${appointmentId} with ERA data`);
    }
  } catch (err) {
    console.error(`Failed to update ERA data for appointment ${appointmentId}:`, err);
  }
}

// Process ERA data and update appointments
async function processEraData(eraData: any): Promise<{ processedCount: number; paymentCount: number; }> {
  let processedCount = 0;
  let paymentCount = 0;
  
  if (!eraData || !eraData.payments) {
    console.log("No payments found in ERA data");
    return { processedCount, paymentCount };
  }
  
  console.log(`Processing ${eraData.payments.length} payments from ERA data`);
  
  for (const payment of eraData.payments) {
    if (!payment.claimId && !payment.claim_id) {
      console.log("Skipping payment with no claim ID");
      continue;
    }
    
    const claimId = payment.claimId || payment.claim_id;
    console.log(`Processing payment for claim ID: ${claimId}`);
    
    const appointmentId = await findAppointmentByClaimId(claimId);
    
    if (!appointmentId) {
      console.log(`No matching appointment found for claim ID: ${claimId}`);
      continue;
    }
    
    console.log(`Updating appointment ${appointmentId} with ERA payment data`);
    await updateAppointmentWithEraData(appointmentId, payment);
    paymentCount++;
  }
  
  processedCount = eraData.payments.length;
  return { processedCount, paymentCount };
}

// Extract ERA IDs from API response that could be XML or JSON
function extractEraIdsFromResponse(responseData: any): { eraId: string }[] {
  console.log("Extracting ERA IDs from response data");
  
  // If we have a JSON response with eras field
  if (responseData && responseData.eras && Array.isArray(responseData.eras)) {
    console.log(`Found ${responseData.eras.length} ERAs in JSON response`);
    return responseData.eras;
  }
  
  // If we have a JSON response with era field
  if (responseData && responseData.era && Array.isArray(responseData.era)) {
    console.log(`Found ${responseData.era.length} ERAs in JSON response with 'era' key`);
    // Map to expected format with eraId property
    return responseData.era.map((item: any) => ({
      eraId: item.eraid?.toString() || item.EraId?.toString() || ""
    })).filter((item: any) => !!item.eraId);
  }
  
  // If we have a raw XML response
  if (responseData && responseData.raw && typeof responseData.raw === 'string' && 
      (responseData.contentType === 'xml' || responseData.format === 'xml' || responseData.raw.includes('<'))) {
    console.log(`Processing XML response to extract ERA IDs`);
    const xml = responseData.raw;
    
    // Very simple XML parsing to extract ERA IDs
    // Example: <era><eraId>123</eraId>...</era><era><eraId>456</eraId>...</era>
    const eraIds: { eraId: string }[] = [];
    const matches = xml.matchAll(/<era.*?>\s*<eraId>(.*?)<\/eraId>|<EraId>(.*?)<\/EraId>/g);
    
    for (const match of matches) {
      const eraId = match[1] || match[2]; // Get the group that matched
      if (eraId) {
        eraIds.push({ eraId });
      }
    }
    
    console.log(`Extracted ${eraIds.length} ERA IDs from XML response`);
    return eraIds;
  }
  
  console.log("Could not extract ERA IDs from response, returning empty array");
  return [];
}

// Get detailed ERA data for a specific ERA ID
async function getEraDetail(eraId: string): Promise<any> {
  console.log(`Fetching details for ERA ID: ${eraId}`);
  
  // Use eradata endpoint for getting ERA details with corrected endpoint name
  const result = await callClaimMdApi(
    'eradata',  // Using corrected endpoint name
    {
      EraId: eraId,
      Format: 'JSON'  // Request JSON format as per documentation
    },
    null
  );
  
  if (!result.success) {
    console.error(`Failed to fetch detail for ERA ${eraId}:`, result.error);
    console.error("Error details:", JSON.stringify(result.data || {}).substring(0, 500));
    return null;
  }
  
  console.log(`Successfully retrieved ERA detail for ID: ${eraId}`);
  
  // Check if we got XML instead of JSON and need to parse it
  if (result.data && result.data.contentType === 'xml') {
    console.log("Received XML response for ERA detail, attempting basic parsing");
    // Here we could implement XML parsing if needed in the future
    // For now, return the raw data
    return result.data;
  }
  
  return result.data;
}

// Log the complete request and response data, including all headers and body contents
async function logFullRequestDebugData(rawRequest: any, rawResponse: any): Promise<void> {
  try {
    await supabase
      .from('api_logs')
      .insert({
        endpoint: 'debug_capture',
        request_payload: rawRequest,
        response_data: rawResponse,
        status: 'debug',
        error_message: null,
        client_id: null,
        processing_time_ms: 0
      });
    
    console.log("Saved full debug data to api_logs table");
  } catch (err) {
    console.error("Failed to save debug data:", err);
  }
}

// Make a simplified test request with minimal parameters
async function makeSimplifiedTestRequest(): Promise<any> {
  console.log("Making simplified test request with minimal parameters");
  
  const result = await callClaimMdApi(
    'eralist',
    {
      NewOnly: "1"  // Only request unprocessed ERA files
    },
    null
  );
  
  // Log the test request result
  await logFullRequestDebugData(
    { 
      type: 'simplified_test', 
      endpoint: 'eralist',
      parameters: { NewOnly: "1" }
    },
    result
  );
  
  return result;
}

// Handle all requests to this function
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log("ERA retrieval function called");
    
    // Only allow POST requests for ERA retrieval
    if (req.method !== 'POST') {
      console.log(`Rejected ${req.method} request, only POST is allowed`);
      return new Response(
        JSON.stringify({ success: false, error: 'Method Not Allowed' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
      );
    }
    
    // Get the last ERA check date
    const lastCheckDate = await getLastEraCheck();
    const today = new Date().toISOString().split('T')[0]; // Today in YYYY-MM-DD format
    
    // Format dates for Claim.MD API (MM-DD-YYYY)
    const formattedLastCheckDate = formatClaimMdDateString(lastCheckDate);
    const formattedToday = formatClaimMdDateString(today);
    
    console.log(`Starting ERA retrieval from ${lastCheckDate} to ${today}`);
    console.log(`Formatted for Claim.MD: ${formattedLastCheckDate} to ${formattedToday}`);
    console.log(`API Key exists: ${!!Deno.env.get('CLAIMMD_API_KEY')}`);
    
    // Optional: First try a minimal test request to validate API connectivity
    const testResult = await makeSimplifiedTestRequest();
    console.log("Test request result:", testResult.success ? "Success" : "Failed");
    
    // Step 1: Call the eralist endpoint with enhanced logging and correct parameters
    console.log("Making ERA list request with full logging enabled");
    const eraListResult = await callClaimMdApi(
      'eralist',  // Using corrected endpoint name
      {
        ReceivedAfterDate: formattedLastCheckDate,  // MM-DD-YYYY format
        ReceivedBeforeDate: formattedToday,         // MM-DD-YYYY format
        NewOnly: "1"                                // Use "1" instead of boolean false
      },
      null
    );
    
    // Extended debug logging for troubleshooting
    await logFullRequestDebugData(
      {
        endpoint: 'eralist',
        parameters: {
          ReceivedAfterDate: formattedLastCheckDate,
          ReceivedBeforeDate: formattedToday,
          NewOnly: "1"
        },
        originalDates: {
          lastCheckDate,
          today
        },
        apiKeyPresent: !!Deno.env.get('CLAIMMD_API_KEY'),
        timestamp: new Date().toISOString()
      },
      eraListResult
    );
    
    if (!eraListResult.success) {
      console.error('ERA list retrieval failed:', eraListResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to retrieve ERA list',
          details: eraListResult.error,
          responseData: eraListResult.data,
          requestInfo: {
            receivedAfterDate: formattedLastCheckDate,
            receivedBeforeDate: formattedToday,
            endpoint: 'eralist'
          },
          testResult: testResult.success ? "Test request succeeded" : "Test request failed" 
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Extract ERA IDs from the response (handling both XML and JSON)
    const eraIds = extractEraIdsFromResponse(eraListResult.data);
    
    if (!eraIds || eraIds.length === 0) {
      // No new ERAs to process
      console.log("No new ERA files to process");
      await updateLastEraCheck(); // Still update the last check date
      return new Response(
        JSON.stringify({
          success: true,
          processedCount: 0,
          paymentCount: 0,
          message: "No new ERA files to process"
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
    console.log(`Found ${eraIds.length} ERA files to process`);
    
    // Step 2: For each ERA ID, get the detailed ERA data
    let totalProcessed = 0;
    let totalPayments = 0;
    
    for (const era of eraIds) {
      const eraId = era.eraId;
      if (!eraId) {
        console.log("Skipping ERA with no ID");
        continue;
      }
      
      console.log(`Processing ERA ID: ${eraId}`);
      const eraDetail = await getEraDetail(eraId);
      
      if (eraDetail) {
        const { processedCount, paymentCount } = await processEraData(eraDetail);
        totalProcessed += processedCount;
        totalPayments += paymentCount;
      }
    }
    
    // Update the last ERA check date
    await updateLastEraCheck();
    
    console.log(`ERA processing completed: ${totalProcessed} records, ${totalPayments} payments`);
    
    return new Response(
      JSON.stringify({
        success: true,
        processedCount: totalProcessed,
        paymentCount: totalPayments,
        message: `Successfully processed ${totalProcessed} ERA records with ${totalPayments} payments`
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
    
  } catch (err) {
    console.error('Unexpected error in era-retrieval function:', err);
    const errorMessage = err instanceof Error ? 
      `${err.name}: ${err.message}${err.stack ? '\nStack: ' + err.stack : ''}` : 
      String(err);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
