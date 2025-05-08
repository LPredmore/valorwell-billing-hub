
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
    
    // Log some key details about each claim for debugging
    jsonClaims.forEach((claim, index) => {
      console.log(`Claim #${index + 1} ID: ${claim.claim_id}`);
      console.log(`  Patient: ${claim.patient.first_name} ${claim.patient.last_name}`);
      console.log(`  Service: ${claim.services[0].cpt_code} on ${claim.services[0].date_of_service}`);
      console.log(`  Amount: ${claim.services[0].charge_amount}`);
    });
    
    // Submit claims to Claim.MD upload endpoint
    const result = await callClaimMdApi(
      'upload', 
      { claims: batchData.claims },
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
    
    const batchId = submissionResult.batchId || submissionResult.batch_id;
    
    if (!batchId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No batch ID returned from Claim.MD', 
          response: submissionResult 
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Update each appointment with claim submission details
    const updateResults = [];
    
    for (let i = 0; i < claimData.length; i++) {
      const appointment = claimData[i].appointment;
      const claimId = submissionResult.claims?.[i]?.claimId || 
                      submissionResult.claims?.[i]?.claim_id ||
                      `pending-${appointment.id}`;
      
      const { data, error } = await supabase
        .from('appointments')
        .update({
          claim_claimmd_id: claimId,
          claim_claimmd_batch_id: batchId,
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
