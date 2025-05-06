
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
    
    // Prepare eligibility request payload
    const eligibilityPayload = {
      provider: {
        npi: practiceData.practice_npi,
        taxId: practiceData.practice_taxid,
        firstName: "", // Not needed for organization
        lastName: practiceData.practice_name,
        organizationName: practiceData.practice_name,
        address: {
          address1: practiceData.practice_address1,
          address2: practiceData.practice_address2 || "",
          city: practiceData.practice_city,
          state: practiceData.practice_state,
          zip: practiceData.practice_zip
        }
      },
      subscriber: {
        memberId: clientData.client_policy_number_primary,
        firstName: clientData.client_first_name,
        lastName: clientData.client_last_name,
        dateOfBirth: clientData.client_date_of_birth,
        gender: clientData.client_gender?.toUpperCase() === 'FEMALE' ? 'F' : 'M', // Claim.MD expects 'M' or 'F'
        address: {
          address1: "", // We don't have these fields, but API might require them
          city: "",
          state: clientData.client_state || "",
          zip: ""
        }
      },
      dependent: null, // Not checking for dependents
      payer: {
        payerId: clientData.client_primary_payer_id,
        name: clientData.client_insurance_company_primary
      },
      serviceTypes: ["98"], // 98 is for Behavioral Health
      serviceDateFrom: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      serviceDateTo: new Date().toISOString().split('T')[0]
    };
    
    // Call Claim.MD API for eligibility check
    const eligibilityResponse = await callClaimMdApi(
      'EligibilityInquiry',
      eligibilityPayload,
      clientId
    );
    
    if (!eligibilityResponse.success) {
      return new Response(JSON.stringify({ 
        error: 'Eligibility check failed', 
        details: eligibilityResponse.error 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Process the eligibility response
    const result = eligibilityResponse.data;
    
    // Extract key eligibility information
    const eligibilityStatus = result.eligibilityStatus || 'Unknown';
    const copay = result.benefitsInformation?.copayAmount || null;
    const deductible = result.benefitsInformation?.deductibleAmount || null;
    const coinsurancePercent = result.benefitsInformation?.coinsurancePercentage || null;
    
    // Update client record with eligibility information
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        eligibility_status_primary: eligibilityStatus,
        eligibility_copay_primary: copay,
        eligibility_deductible_primary: deductible,
        eligibility_coinsurance_primary_percent: coinsurancePercent,
        eligibility_last_checked_primary: new Date().toISOString(),
        eligibility_response_details_primary_json: result,
        eligibility_claimmd_id_primary: result.id || null
      })
      .eq('id', clientId);
      
    if (updateError) {
      console.error('Error updating client with eligibility data:', updateError);
    }
    
    // Return the eligibility results
    return new Response(JSON.stringify({
      success: true,
      eligibility: {
        status: eligibilityStatus,
        copay: copay,
        deductible: deductible,
        coinsurancePercent: coinsurancePercent,
        lastChecked: new Date().toISOString(),
        claimMdId: result.id || null
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
