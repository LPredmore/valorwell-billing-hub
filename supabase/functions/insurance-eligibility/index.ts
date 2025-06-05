// Edge function for checking insurance eligibility through Claim.MD API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { callClaimMdApi } from '../shared/claimmd-api.ts';
import { formatEligibilityPayload, getClaimMdErrorMessage, determineEligibilityStatus } from '../shared/claimmd-formatter.ts';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

// Create a Supabase client with the service role key for server-side operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse the request body
    const { clientId } = await req.json();

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Client ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Checking eligibility for client: ${clientId}`);

    // Get client information
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      console.error('Error fetching client data:', clientError);
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get practice information
    const { data: practiceData, error: practiceError } = await supabase
      .from('practiceinfo')
      .select('*')
      .single();

    if (practiceError || !practiceData) {
      console.error('Error fetching practice data:', practiceError);
      return new Response(JSON.stringify({ error: 'Practice information not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate required client insurance information
    if (!clientData.client_policy_number_primary || !clientData.client_insurance_company_primary) {
      return new Response(JSON.stringify({
        error: 'Missing required client insurance information',
        details: 'Policy number and insurance company are required for eligibility checks'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log environment variable key (masked) to verify it's available
    const apiKeyEnv = Deno.env.get('CLAIMMD_API_KEY');
    if (!apiKeyEnv) {
      console.error('CRITICAL ERROR: CLAIMMD_API_KEY environment variable is not set');
      return new Response(JSON.stringify({ error: 'API configuration error', details: 'Missing API key configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      // Log just the first 4 and last 4 characters for verification purposes
      const keyLength = apiKeyEnv.length;
      const maskedKey = keyLength > 8 ?
        `${apiKeyEnv.substring(0, 4)}...${apiKeyEnv.substring(keyLength - 4)}` :
        '********';
      console.log(`CLAIMMD_API_KEY environment variable is set (masked: ${maskedKey}), length: ${keyLength} chars`);
    }

    // Log raw client data before transformation
    console.log('Raw client data for eligibility check:', {
      clientId: clientId,
      name: `${clientData.client_first_name} ${clientData.client_last_name}`,
      dob: clientData.client_date_of_birth,
      gender: clientData.client_gender,
      policy: clientData.client_policy_number_primary,
      insurance: clientData.client_insurance_company_primary,
      payerId: clientData.client_primary_payer_id,
      relationship: clientData.client_subscriber_relationship_primary,
      subscriberName: clientData.client_subscriber_name_primary,
      subscriberDob: clientData.client_subscriber_dob_primary
    });

    // Format data properly for Claim.MD API using our formatter
    const eligibilityPayload = formatEligibilityPayload(clientData, practiceData);

    // Log transformed data for verification
    console.log('Transformed payload for Claim.MD:', {
      ins_number: eligibilityPayload.ins_number,
      ins_name_f: eligibilityPayload.ins_name_f,
      ins_name_l: eligibilityPayload.ins_name_l,
      ins_dob: eligibilityPayload.ins_dob,
      ins_sex: eligibilityPayload.ins_sex,
      pat_rel: eligibilityPayload.pat_rel,
      fdos: eligibilityPayload.fdos,
      tdos: eligibilityPayload.tdos,
      payerid: eligibilityPayload.payerid
    });

    // Call Claim.MD API for eligibility check
    const eligibilityResponse = await callClaimMdApi(
      'eligdata/', // Using the correct endpoint
      eligibilityPayload,
      clientId
    );

    // IMPORTANT: Properly check for errors in the API response
    if (!eligibilityResponse.success) {
      const errorDetails = eligibilityResponse.error || 'Unknown API error';
      console.error('Eligibility check failed:', errorDetails);

      // Extract error code if available
      const errorCode = eligibilityResponse.data?.error?.error_code;
      const errorMsg = eligibilityResponse.data?.error?.error_mesg;
      const interpretedError = errorCode ? getClaimMdErrorMessage(errorCode) : 'Unknown API error';
      const formattedErrorDetails = `${errorMsg || interpretedError} (Code: ${errorCode || 'unknown'})`;

      // Update client record with specific error information
      await supabase
        .from('clients')
        .update({
          eligibility_status_primary: 'Error',
          eligibility_last_checked_primary: new Date().toISOString(),
          eligibility_response_details_primary_json: {
            error: formattedErrorDetails,
            timestamp: new Date().toISOString(),
            requestId: eligibilityPayload.request_id,
            originalErrorData: eligibilityResponse.data?.error || errorDetails
          }
        })
        .eq('id', clientId);

      return new Response(JSON.stringify({
        error: 'Eligibility check failed',
        details: formattedErrorDetails,
        errorCode: errorCode || 'unknown',
        userMessage: interpretedError
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process the eligibility response
    const result = eligibilityResponse.data;
    console.log('Raw eligibility response:', JSON.stringify(result));

    // Safety check - ensure we have valid data
    if (!result || typeof result !== 'object') {
      console.error('Invalid eligibility response format:', result);

      await supabase
        .from('clients')
        .update({
          eligibility_status_primary: 'Error',
          eligibility_last_checked_primary: new Date().toISOString(),
          eligibility_response_details_primary_json: {
            error: 'Invalid response format',
            rawResponse: result
          }
        })
        .eq('id', clientId);

      return new Response(JSON.stringify({
        error: 'Invalid eligibility response format',
        details: 'The API returned data in an unexpected format'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use our new helper function to determine eligibility status and extract benefit details
    const { status: finalStatus, copay, deductible, coinsurancePercent } = determineEligibilityStatus(result);

    console.log(`Extracted eligibility status: ${finalStatus}`);

    // Update client record with eligibility information
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        eligibility_status_primary: finalStatus,
        eligibility_copay_primary: copay,
        eligibility_deductible_primary: deductible,
        eligibility_coinsurance_primary_percent: coinsurancePercent,
        eligibility_last_checked_primary: new Date().toISOString(),
        eligibility_response_details_primary_json: {
          ...result,
          processed_at: new Date().toISOString(),
          normalized_status: finalStatus,
          request_payload: eligibilityPayload
        },
        eligibility_claimmd_id_primary: result.id || (result.elig && result.elig.eligid) || null
      })
      .eq('id', clientId);

    if (updateError) {
      console.error('Error updating client with eligibility data:', updateError);
    }

    // Return the eligibility results with more detailed information
    return new Response(JSON.stringify({
      success: true,
      eligibility: {
        status: finalStatus,
        copay: copay,
        deductible: deductible,
        coinsurancePercent: coinsurancePercent,
        lastChecked: new Date().toISOString(),
        claimMdId: result.id || (result.elig && result.elig.eligid) || null
      },
      details: {
        benefitInfo: result.benefitsInformation || result.elig?.benefit || null,
        planInfo: result.planInformation || result.elig?.plan_name || null,
        providerInfo: result.providerInformation || null
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing eligibility request:', error);

    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
