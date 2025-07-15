// Edge function for checking insurance eligibility through Claim.MD API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { callClaimMdApi } from '../shared/claimmd-api.ts';
import { formatEligibilityPayload, getClaimMdErrorMessage, determineEligibilityStatus } from '../shared/claimmd-formatter.ts';

// Enhanced logging structure
interface LogEntry {
  endpoint: string;
  status: string;
  error_message?: string;
  error_category?: string;
  error_severity?: string;
  correlation_id: string;
  user_context?: Record<string, any>;
  client_context?: Record<string, any>;
  request_payload?: Record<string, any>;
  response_data?: Record<string, any>;
  response_time_ms?: number;
  client_id?: string;
  retry_count?: number;
}

// Error categorization function
function categorizeError(errorMessage: string, errorCode?: string): string {
  if (errorCode === '20' || errorMessage.includes('api key') || errorMessage.includes('authentication')) {
    return 'api_authentication';
  }
  if (errorMessage.includes('timeout') || errorMessage.includes('connection') || errorMessage.includes('network')) {
    return 'network_error';
  }
  if (errorCode === '75' || errorCode === '72' || errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('missing')) {
    return 'data_validation';
  }
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    return 'rate_limiting';
  }
  if (errorMessage.includes('not enrolled') || errorMessage.includes('provider')) {
    return 'provider_enrollment';
  }
  if (errorMessage.includes('payer') || errorMessage.includes('unavailable') || errorMessage.includes('service disrupted')) {
    return 'payer_specific';
  }
  return 'system_error';
}

// Determine error severity
function determineErrorSeverity(category: string, retryCount: number = 0): string {
  switch (category) {
    case 'api_authentication':
      return 'critical';
    case 'system_error':
      return retryCount > 3 ? 'critical' : 'high';
    case 'network_error':
      return retryCount > 5 ? 'high' : 'medium';
    case 'rate_limiting':
      return 'medium';
    case 'data_validation':
      return 'low';
    case 'provider_enrollment':
    case 'payer_specific':
      return 'medium';
    default:
      return 'medium';
  }
}

// Enhanced logging function
async function logApiActivity(supabase: any, logEntry: LogEntry): Promise<void> {
  try {
    const { error } = await supabase
      .from('api_logs')
      .insert({
        ...logEntry,
        created_at: new Date().toISOString(),
        processing_time_ms: logEntry.response_time_ms || 0
      });
    
    if (error) {
      console.error('Failed to log API activity:', error);
    }
  } catch (err) {
    console.error('Logging service error:', err);
  }
}

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
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      await logApiActivity(supabase, {
        endpoint: 'eligdata/',
        status: 'error',
        error_message: 'Method not allowed',
        error_category: 'data_validation',
        error_severity: 'low',
        correlation_id: correlationId,
        response_time_ms: Date.now() - startTime
      });
      
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse the request body
    const { clientId } = await req.json();

    if (!clientId) {
      await logApiActivity(supabase, {
        endpoint: 'eligdata/',
        status: 'error',
        error_message: 'Client ID is required',
        error_category: 'data_validation',
        error_severity: 'low',
        correlation_id: correlationId,
        response_time_ms: Date.now() - startTime
      });
      
      return new Response(JSON.stringify({ error: 'Client ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Checking eligibility for client: ${clientId} (correlation: ${correlationId})`);

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

      // Enhanced error logging
      const errorCategory = categorizeError(errorDetails, errorCode);
      const errorSeverity = determineErrorSeverity(errorCategory);
      
      await logApiActivity(supabase, {
        endpoint: 'eligdata/',
        status: 'error',
        error_message: formattedErrorDetails,
        error_category: errorCategory,
        error_severity: errorSeverity,
        correlation_id: correlationId,
        client_id: clientId,
        user_context: { user_type: 'system' },
        client_context: {
          age_range: clientData.client_age ? `${Math.floor(clientData.client_age / 10) * 10}s` : undefined,
          state: clientData.client_state,
          insurance_type: clientData.client_insurance_type_primary,
          payer_id: clientData.client_primary_payer_id
        },
        request_payload: eligibilityPayload,
        response_data: eligibilityResponse.data,
        response_time_ms: Date.now() - startTime
      });

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
            originalErrorData: eligibilityResponse.data?.error || errorDetails,
            correlation_id: correlationId
          }
        })
        .eq('id', clientId);

      return new Response(JSON.stringify({
        error: 'Eligibility check failed',
        details: formattedErrorDetails,
        errorCode: errorCode || 'unknown',
        userMessage: interpretedError,
        correlationId: correlationId
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

    // Log successful operation
    await logApiActivity(supabase, {
      endpoint: 'eligdata/',
      status: 'success',
      correlation_id: correlationId,
      client_id: clientId,
      user_context: { user_type: 'system' },
      client_context: {
        age_range: clientData.client_age ? `${Math.floor(clientData.client_age / 10) * 10}s` : undefined,
        state: clientData.client_state,
        insurance_type: clientData.client_insurance_type_primary,
        payer_id: clientData.client_primary_payer_id
      },
      request_payload: eligibilityPayload,
      response_data: {
        status: finalStatus,
        copay: copay,
        deductible: deductible,
        coinsurancePercent: coinsurancePercent
      },
      response_time_ms: Date.now() - startTime
    });

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
      },
      correlationId: correlationId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing eligibility request:', error);

    // Log unexpected system errors
    await logApiActivity(supabase, {
      endpoint: 'eligdata/',
      status: 'error',
      error_message: error instanceof Error ? error.message : String(error),
      error_category: 'system_error',
      error_severity: 'critical',
      correlation_id: correlationId,
      response_time_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
      correlationId: correlationId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
