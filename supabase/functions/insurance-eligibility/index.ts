
// Edge function for checking insurance eligibility through Claim.MD API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { callClaimMdApi } from '../shared/claimmd-api.ts';

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
    
    // Prepare eligibility request payload - simplified to match Claim.MD's expected format
    // This avoids deep nested objects that might not be properly formatted in x-www-form-urlencoded
    const eligibilityPayload = {
      // Provider information
      providerNpi: practiceData.practice_npi,
      providerTaxId: practiceData.practice_taxid,
      providerFirstName: "", // Not needed for organization
      providerLastName: practiceData.practice_name,
      providerOrganizationName: practiceData.practice_name,
      providerAddress1: practiceData.practice_address1,
      providerAddress2: practiceData.practice_address2 || "",
      providerCity: practiceData.practice_city,
      providerState: practiceData.practice_state,
      providerZip: practiceData.practice_zip,
      
      // Subscriber information
      subscriberMemberId: clientData.client_policy_number_primary,
      subscriberFirstName: clientData.client_first_name,
      subscriberLastName: clientData.client_last_name,
      subscriberDateOfBirth: clientData.client_date_of_birth,
      subscriberGender: clientData.client_gender?.toUpperCase() === 'FEMALE' ? 'F' : 'M', // Claim.MD expects 'M' or 'F'
      subscriberAddress1: "", 
      subscriberCity: "",
      subscriberState: clientData.client_state || "",
      subscriberZip: "",
      
      // Payer information
      payerId: clientData.client_primary_payer_id,
      payerName: clientData.client_insurance_company_primary,
      
      // Service information
      serviceTypes: "98", // 98 is for Behavioral Health
      serviceDateFrom: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      serviceDateTo: new Date().toISOString().split('T')[0],
      
      // No dependent information needed
      isDependentRequest: "false"
    };
    
    console.log('Eligibility payload prepared:', JSON.stringify(eligibilityPayload));
    
    // Call Claim.MD API for eligibility check
    const eligibilityResponse = await callClaimMdApi(
      'EligibilityInquiry',
      eligibilityPayload,
      clientId
    );
    
    // IMPORTANT: Properly check for errors in the API response
    if (!eligibilityResponse.success) {
      const errorDetails = eligibilityResponse.error || 'Unknown API error';
      console.error('Eligibility check failed:', errorDetails);
      
      // Update client record with specific error information
      await supabase
        .from('clients')
        .update({
          eligibility_status_primary: 'Error',
          eligibility_last_checked_primary: new Date().toISOString(),
          eligibility_response_details_primary_json: { 
            error: errorDetails,
            timestamp: new Date().toISOString(),
            requestId: Math.random().toString(36).substring(2, 15)
          }
        })
        .eq('id', clientId);
        
      return new Response(JSON.stringify({ 
        error: 'Eligibility check failed', 
        details: errorDetails,
        errorCode: eligibilityResponse.data?.error?.error_code || 'unknown'
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
    
    // Extract key eligibility information with better error handling
    const eligibilityStatus = result.eligibilityStatus || 'Unknown';
    let finalStatus = eligibilityStatus;
    
    // Normalize status values to something more user-friendly
    if (/active|eligible/i.test(eligibilityStatus)) {
      finalStatus = 'Active';
    } else if (/inactive|ineligible|terminated/i.test(eligibilityStatus)) {
      finalStatus = 'Inactive';
    } else {
      // If we can't determine a clear status, mark as unknown
      finalStatus = 'Unknown';
      console.log(`Received unclear eligibility status: "${eligibilityStatus}", marking as Unknown`);
    }
    
    // Extract benefit details with proper null handling
    const copay = result.benefitsInformation?.copayAmount || null;
    const deductible = result.benefitsInformation?.deductibleAmount || null;
    const coinsurancePercent = result.benefitsInformation?.coinsurancePercentage || null;
    
    console.log(`Extracted eligibility status: ${finalStatus} (original: ${eligibilityStatus})`);
    
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
          original_status: eligibilityStatus
        },
        eligibility_claimmd_id_primary: result.id || null
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
        originalStatus: eligibilityStatus,
        copay: copay,
        deductible: deductible,
        coinsurancePercent: coinsurancePercent,
        lastChecked: new Date().toISOString(),
        claimMdId: result.id || null
      },
      details: {
        benefitInfo: result.benefitsInformation || null,
        planInfo: result.planInformation || null,
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
