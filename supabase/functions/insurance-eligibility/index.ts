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
    
    // Prepare eligibility request payload - tailored specifically for Claim.MD's requirements
    // Keep only the essential fields and ensure proper naming according to their API docs
    const eligibilityPayload = {
      // These field names are based exactly on Claim.MD's /services/eligdata/ documentation from their PDF
      // Provider information - using the field names they expect
      prov_npi: practiceData.practice_npi,
      prov_taxid: practiceData.practice_taxid,
      prov_lname: practiceData.practice_name, // For organizations
      prov_fname: "",  // Not needed for organization
      prov_addr1: practiceData.practice_address1,
      prov_addr2: practiceData.practice_address2 || "",
      prov_city: practiceData.practice_city,
      prov_state: practiceData.practice_state,
      prov_zip: practiceData.practice_zip,
      
      // Subscriber/Patient information
      ins_id: clientData.client_policy_number_primary,
      ins_name_l: clientData.client_last_name,
      ins_name_f: clientData.client_first_name,
      dob: clientData.client_date_of_birth,
      gender: clientData.client_gender?.toUpperCase() === 'FEMALE' ? 'F' : 'M',
      
      // Payer information
      payerid: clientData.client_primary_payer_id || "",
      ins_name: clientData.client_insurance_company_primary,
      
      // Service information
      service_type: "98", // 98 is for Behavioral Health
      fdos: new Date().toISOString().split('T')[0],  // From Date of Service (current date)
      tdos: new Date().toISOString().split('T')[0],  // To Date of Service (current date)
      
      // Required by Claim.MD docs
      pat_rel: "SELF", // Relationship to subscriber (SELF, SPOUSE, CHILD, OTHER)
      request_id: `${clientId.substring(0,8)}-${Date.now()}` // Unique request ID
    };
    
    // DEBUG logging for key parameters
    console.log('Eligibility payload prepared:', JSON.stringify(eligibilityPayload));
    console.log('CRITICAL DEBUG INFO:');
    console.log(`Client ID: ${clientId}`);
    console.log(`Patient name: ${eligibilityPayload.ins_name_f} ${eligibilityPayload.ins_name_l}`);
    console.log(`Insurance ID: ${eligibilityPayload.ins_id}`);
    console.log(`Insurance name: ${eligibilityPayload.ins_name}`);
    console.log(`Payer ID: ${eligibilityPayload.payerid}`);
    
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
