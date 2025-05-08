
// Edge function to submit claims to Claim.MD

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { fetchClaimData, formatClaimJSON, formatClaimBatchJSON } from '../shared/claim-formatter.ts';
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

// Handle all requests to this function
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Only allow POST requests for claim submission
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method Not Allowed' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
      );
    }

    // Parse the request body
    const requestData = await req.json();
    const appointmentIds = requestData.appointmentIds || [];
    
    if (!appointmentIds.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'No appointment IDs provided' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    console.log(`Processing ${appointmentIds.length} appointments for claim submission`);
    
    // Prepare claims data for each appointment
    const claimData = [];
    const errors = [];
    
    for (const appointmentId of appointmentIds) {
      try {
        const data = await fetchClaimData(appointmentId);
        
        // CRITICAL: Log client's primary payer ID to verify it's being properly retrieved
        console.log(`Appointment ${appointmentId} - Client ID: ${data.client.id} - Primary Payer ID from DB: ${data.client.client_primary_payer_id || 'NOT SET'}`);
        
        // Log client's state value to verify state handling
        console.log(`Appointment ${appointmentId} - Client State from DB: ${data.client.client_state || 'NOT SET'}`);
        
        // Validate required claim data
        if (!data.appointment.cpt_code) {
          throw new Error(`Appointment ${appointmentId} is missing CPT code`);
        }
        if (!data.appointment.billed_amount) {
          throw new Error(`Appointment ${appointmentId} is missing billed amount`);
        }
        
        claimData.push(data);
      } catch (err) {
        console.error(`Error processing appointment ${appointmentId}:`, err);
        errors.push({ appointmentId, error: err.message });
      }
    }
    
    if (!claimData.length) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No valid claims to submit', 
          details: errors 
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }
    
    // Format claims into JSON format for Claim.MD
    const jsonClaims = claimData.map(data => formatClaimJSON(data));
    const batchData = formatClaimBatchJSON(jsonClaims);
    
    // Log the actual data being sent
    console.log(`Submitting ${jsonClaims.length} claims to Claim.MD`);
    
    // CRITICAL: Inspect and log specific fields we're focused on troubleshooting
    jsonClaims.forEach((claim, index) => {
      console.log(`Claim #${index + 1} ID: ${claim.remote_claimid}`);
      console.log(`  Patient: ${claim.pat_name_f} ${claim.pat_name_l}`);
      console.log(`  Patient DOB: ${claim.pat_dob}`);
      console.log(`  Gender: ${claim.pat_sex}`);
      console.log(`  Relationship: ${claim.pat_rel}`);
      console.log(`  Service: ${claim.charge[0].proc_code} from ${claim.charge[0].from_date} to ${claim.charge[0].thru_date}`);
      console.log(`  POS: ${claim.charge[0].place_of_service}`);
      console.log(`  Modifiers: ${[claim.charge[0].mod_1, claim.charge[0].mod_2, claim.charge[0].mod_3, claim.charge[0].mod_4].filter(Boolean).join(', ') || 'None'}`);
      console.log(`  Diagnosis: ${[claim.diag_1, claim.diag_2, claim.diag_3, claim.diag_4].filter(Boolean).join(', ') || 'None'}`);
      console.log(`  Amount: ${claim.charge[0].charge}`);

      // CRITICAL: Log the specific fields we need to debug
      console.log(`  CRITICAL - Patient State: ${claim.pat_state || 'MISSING'}`);
      console.log(`  CRITICAL - Insured State: ${claim.ins_state || 'MISSING'}`);
      console.log(`  CRITICAL - Payer ID: ${claim.payer_id || 'MISSING'}`);
      console.log(`  CRITICAL - Tax ID: ${claim.bill_taxid || 'MISSING'}`);
      console.log(`  CRITICAL - Tax ID Type: ${claim.bill_taxid_type || 'MISSING'}`);
      
      console.log(`  Provider City: ${claim.bill_city}`);
      console.log(`  Provider State: ${claim.bill_state || 'MISSING'}`);
      
      // Check specifically for payer_name
      if ('payer_name' in claim) {
        console.log(`  WARNING: payer_name field is still present with value: ${claim.payer_name}`);
      } else {
        console.log(`  VERIFIED: payer_name field has been successfully removed`);
      }
    });
    
    // Log the final JSON string for verification
    console.log("Full claim batch JSON:", JSON.stringify(batchData, null, 2));
    
    // Submit claims to Claim.MD upload endpoint - ensure endpoint has trailing slash
    const result = await callClaimMdApi(
      'upload/', 
      batchData,
      null // No client ID association for this batch operation
    );
    
    // Enhanced error logging for troubleshooting
    if (!result.success) {
      console.error('Claim submission failed with response:', JSON.stringify(result));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Claim submission failed', 
          details: result.error,
          response: result.data || {} // Include any response data for debugging
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Process successful response from Claim.MD
    const submissionResult = result.data;
    console.log('Successful submission result:', JSON.stringify(submissionResult));
    
    // Check for batch ID or claim IDs in the response
    const batchId = submissionResult.batchId || submissionResult.batch_id;
    let claimProcessingResult = submissionResult.claim || [];
    
    if (claimProcessingResult.length > 0) {
      // Check if any claims were rejected
      const rejectedClaims = claimProcessingResult.filter(claim => claim.status === 'R');
      if (rejectedClaims.length > 0) {
        // Some claims were rejected, but we still got a response
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Claims were rejected by Claim.MD', 
            details: rejectedClaims,
            claimData: claimProcessingResult
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
        );
      }
    }
    
    if (!batchId && (!claimProcessingResult || claimProcessingResult.length === 0)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No batch ID or claim IDs returned from Claim.MD', 
          response: submissionResult 
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Extract claim IDs from the response if present
    const claimIds = claimProcessingResult.map(claim => claim.claimmd_id || claim.claim_id || '');
    
    // Update each appointment with claim submission details
    const updateResults = [];
    
    for (let i = 0; i < claimData.length; i++) {
      const appointment = claimData[i].appointment;
      const claimId = claimIds[i] || batchId ? `${batchId}-${i+1}` : `pending-${appointment.id}`;
      
      const { data, error } = await supabase
        .from('appointments')
        .update({
          claim_claimmd_id: claimId,
          claim_claimmd_batch_id: batchId || null,
          claim_status: 'Submitted to Clearinghouse',
          claim_last_submission_date: new Date().toISOString(),
          claim_response_json: submissionResult
        })
        .eq('id', appointment.id)
        .select();
        
      updateResults.push({
        appointmentId: appointment.id,
        success: !error,
        error: error?.message,
        claimId,
        batchId
      });
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        batchId: batchId,
        message: `Successfully submitted ${claimData.length} claims to Claim.MD`,
        details: updateResults
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
    
  } catch (err) {
    console.error('Unexpected error in claim-submission function:', err);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message,
        stack: err.stack // Include stack trace for debugging
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
