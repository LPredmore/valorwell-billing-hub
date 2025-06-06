// Edge function to submit claims to Claim.MD

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { fetchClaimData, formatClaimJSON, formatClaimBatchJSON } from '../shared/claim-formatter.ts';
import { callClaimMdApi } from '../shared/claimmd-api.ts';
import { insertCMS1500Claim } from '../shared/cms1500-claims.ts';

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
      console.log(`  CRITICAL - Payer ID: ${claim.payerid || 'MISSING'}`);
      console.log(`  CRITICAL - Tax ID: ${claim.bill_taxid || 'MISSING'}`);
      console.log(`  CRITICAL - Tax ID Type: ${claim.bill_taxid_type || 'MISSING'}`);

      console.log(`  Provider City: ${claim.bill_city}`);
      console.log(`  Provider State: ${claim.bill_state || 'MISSING'}`);
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

    // FIXED: Extract claim IDs correctly - only use claimid field
    const claimIds = claimProcessingResult.map(claim => claim.claimid || '');

    // Update each appointment with claim submission details
    const updateResults = [];

    for (let i = 0; i < claimData.length; i++) {
      const appointment = claimData[i].appointment;
      const claimId = claimIds[i] || batchId ? `${batchId}-${i+1}` : `pending-${appointment.id}`;

      // FIXED: Update the correct field name 'claimid' instead of 'claim_claimmd_id'
      const { data, error } = await supabase
        .from('appointments')
        .update({
          claimid: claimId,
          claim_claimmd_batch_id: batchId || null,
          claim_status: 'Submitted to Clearinghouse',
          claim_last_submission_date: new Date().toISOString(),
          claim_response_json: submissionResult
        })
        .eq('id', appointment.id)
        .select();

      // Insert a copy of the claim into CMS1500_claims table
      try {
        const claimObj = jsonClaims[i];
        await insertCMS1500Claim({
          appointment_id: appointment.id,
          claim_md_batch_id: batchId || null,
          claim_md_id: claimId,
          status: 'Submitted to Clearinghouse',
          last_submission: new Date().toISOString(),
          last_status_check: null,
          response_json: submissionResult,
          remote_claimid: claimObj.remote_claimid,
          pcn: claimObj.pcn,
          pat_name_f: claimObj.pat_name_f,
          pat_name_l: claimObj.pat_name_l,
          pat_dob: claimObj.pat_dob,
          pat_sex: claimObj.pat_sex,
          pat_addr_1: claimObj.pat_addr_1,
          pat_city: claimObj.pat_city,
          pat_state: claimObj.pat_state,
          pat_zip: claimObj.pat_zip,
          ins_name_f: claimObj.ins_name_f,
          ins_name_l: claimObj.ins_name_l,
          ins_dob: claimObj.ins_dob,
          pat_rel: claimObj.pat_rel,
          ins_number: claimObj.ins_number,
          ins_group: claimObj.ins_group || null,
          ins_addr_1: claimObj.ins_addr_1,
          ins_city: claimObj.ins_city,
          ins_state: claimObj.ins_state,
          ins_zip: claimObj.ins_zip,
          payerid: claimObj.payerid || null,
          bill_taxid: claimObj.bill_taxid,
          bill_taxid_type: claimObj.bill_taxid_type,
          bill_npi: claimObj.bill_npi,
          bill_name: claimObj.bill_name,
          bill_taxonomy: claimObj.bill_taxonomy,
          bill_addr_1: claimObj.bill_addr_1,
          bill_addr_2: claimObj.bill_addr_2 || null,
          bill_city: claimObj.bill_city,
          bill_state: claimObj.bill_state,
          bill_zip: claimObj.bill_zip,
          prov_npi: claimObj.prov_npi,
          prov_name_f: claimObj.prov_name_f,
          prov_name_l: claimObj.prov_name_l,
          prov_taxonomy: claimObj.prov_taxonomy || null,
          diag_1: claimObj.diag_1 || null,
          diag_2: claimObj.diag_2 || null,
          diag_3: claimObj.diag_3 || null,
          diag_4: claimObj.diag_4 || null,
          diag_5: claimObj.diag_5 || null,
          diag_6: claimObj.diag_6 || null,
          diag_7: claimObj.diag_7 || null,
          diag_8: claimObj.diag_8 || null,
          diag_9: claimObj.diag_9 || null,
          diag_10: claimObj.diag_10 || null,
          diag_11: claimObj.diag_11 || null,
          diag_12: claimObj.diag_12 || null,
          total_charge: claimObj.total_charge,
          accept_assign: claimObj.accept_assign,
          from_date: claimObj.charge[0].from_date,
          thru_date: claimObj.charge[0].thru_date,
          proc_code: claimObj.charge[0].proc_code,
          mod_1: claimObj.charge[0].mod_1 || null,
          mod_2: claimObj.charge[0].mod_2 || null,
          mod_3: claimObj.charge[0].mod_3 || null,
          mod_4: claimObj.charge[0].mod_4 || null,
          place_of_service: claimObj.charge[0].place_of_service,
          diag_ref: claimObj.charge[0].diag_ref,
          units: parseInt(claimObj.charge[0].units),
          charge: parseFloat(claimObj.charge[0].charge)
        });
      } catch (err) {
        console.error('Error inserting CMS1500 claim:', err);
      }

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
