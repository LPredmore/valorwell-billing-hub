
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

// Get detailed ERA data for a specific ERA ID
async function getEraDetail(eraId: string): Promise<any> {
  console.log(`Fetching details for ERA ID: ${eraId}`);
  
  const result = await callClaimMdApi(
    'eradata', 
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
  return result.data;
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
    
    console.log(`Starting ERA retrieval from ${lastCheckDate} to ${today}`);
    console.log(`API Key exists: ${!!Deno.env.get('CLAIMMD_API_KEY')}`);
    
    // Step 1: First call the eralist endpoint to get available ERAs
    // Use the documented format from the Claim.MD API v1.17 PDF
    const eraListResult = await callClaimMdApi(
      'eralist',
      {
        FromDate: lastCheckDate,
        ToDate: today,
        IncludeProcessed: false // Only get unprocessed ERAs
      },
      null
    );
    
    if (!eraListResult.success) {
      console.error('ERA list retrieval failed:', eraListResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to retrieve ERA list',
          details: eraListResult.error,
          data: eraListResult.data // Include any data that might help diagnose
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Check if we have ERA IDs to process
    const eraIds = eraListResult.data?.eras || [];
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
      const eraId = era.eraId || era.era_id || era.id;
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
