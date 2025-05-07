
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
      era_claimmd_id: paymentData.claimId || paymentData.claim_id,
      claim_status: 'Payment Received',
      claim_status_last_checked: new Date().toISOString()
    };
    
    // Add payment info if available
    if (paymentData.paidAmount) {
      updateData.insurance_paid_amount = parseFloat(paymentData.paidAmount);
    }
    
    // Add adjustment info if available
    if (paymentData.adjustmentAmount) {
      updateData.insurance_adjustment_amount = parseFloat(paymentData.adjustmentAmount);
    }
    
    // Add detailed adjustment info if available
    if (paymentData.adjustments) {
      updateData.insurance_adjustment_details_json = paymentData.adjustments;
    }
    
    // Add patient responsibility if available
    if (paymentData.patientResponsibility) {
      updateData.patient_responsibility_amount = parseFloat(paymentData.patientResponsibility);
    }
    
    // Add payment date if available
    if (paymentData.paymentDate) {
      updateData.era_payment_date = paymentData.paymentDate;
    }
    
    // Add check/EFT number if available
    if (paymentData.checkNumber || paymentData.eftNumber) {
      updateData.era_check_eft_number = paymentData.checkNumber || paymentData.eftNumber;
    }
    
    // Handle denial
    if (paymentData.denied) {
      updateData.claim_status = 'Denied';
      updateData.denial_details_json = paymentData.denialReasons;
      updateData.requires_billing_review = true;
    }
    
    // Update the appointment
    const { error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId);
    
    if (error) {
      console.error(`Error updating ERA data for appointment ${appointmentId}:`, error);
    }
  } catch (err) {
    console.error(`Failed to update ERA data for appointment ${appointmentId}:`, err);
  }
}

// Process ERA file and update appointments
async function processEraData(eraData: any): Promise<{ processedCount: number; paymentCount: number; }> {
  let processedCount = 0;
  let paymentCount = 0;
  
  if (!eraData || !eraData.payments) {
    return { processedCount, paymentCount };
  }
  
  for (const payment of eraData.payments) {
    if (!payment.claimId && !payment.claim_id) continue;
    
    const claimId = payment.claimId || payment.claim_id;
    const appointmentId = await findAppointmentByClaimId(claimId);
    
    if (!appointmentId) continue;
    
    await updateAppointmentWithEraData(appointmentId, payment);
    paymentCount++;
  }
  
  processedCount = eraData.payments.length;
  return { processedCount, paymentCount };
}

// Handle all requests to this function
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Only allow POST requests for ERA retrieval
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method Not Allowed' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
      );
    }
    
    // Get the last ERA check date
    const lastCheckDate = await getLastEraCheck();
    console.log(`Retrieving ERAs since: ${lastCheckDate}`);
    
    // Call the Claim.MD API to get ERA files
    const result = await callClaimMdApi(
      'era', 
      { 
        FromDate: lastCheckDate,
        ToDate: new Date().toISOString().split('T')[0] // Today
      },
      null // No client ID association for this operation
    );
    
    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to retrieve ERA files', 
          details: result.error 
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }
    
    // Process the ERA data to update appointments
    const { processedCount, paymentCount } = await processEraData(result.data);
    
    // Update the last ERA check date
    await updateLastEraCheck();
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processedCount,
        paymentCount,
        message: `Successfully processed ${processedCount} ERA records with ${paymentCount} payments`
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
    
  } catch (err) {
    console.error('Unexpected error in era-retrieval function:', err);
    
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
