
// Edge function to retrieve appointments that are ready for billing

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const status = url.searchParams.get('status') || 'completed';
    
    // Fetch appointments ready for billing (completed but not claimed)
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        client_id,
        clinician_id,
        type,
        start_at,
        end_at,
        cpt_code,
        modifiers,
        diagnosis_code_pointers,
        place_of_service_code,
        billed_amount,
        claim_status,
        claim_claimmd_id,
        claim_last_submission_date,
        clients(
          id,
          client_first_name,
          client_last_name,
          client_insurance_company_primary
        ),
        clinicians(
          id,
          clinician_first_name,
          clinician_last_name
        )
      `)
      .eq('status', status)
      .is('claim_claimmd_id', null) // No existing claim ID
      .or('claim_status.is.null,claim_status.eq.rejected') // Either null or rejected claim status
      .order('start_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching billable appointments:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }

    // Format the response data
    const formattedAppointments = appointments.map(appt => {
      const client = appt.clients;
      const clinician = appt.clinicians;
      
      return {
        id: appt.id,
        start_at: appt.start_at,
        client: {
          id: client.id,
          name: `${client.client_first_name} ${client.client_last_name}`,
          insurance: client.client_insurance_company_primary
        },
        provider: {
          id: clinician.id,
          name: `${clinician.clinician_first_name} ${clinician.clinician_last_name}`
        },
        service: {
          type: appt.type,
          cpt_code: appt.cpt_code || '',
          modifiers: appt.modifiers || [],
          diagnosis_pointers: appt.diagnosis_code_pointers || '',
          place_of_service: appt.place_of_service_code || ''
        },
        billing: {
          amount: appt.billed_amount || 0,
          status: appt.claim_status || 'Not Submitted',
          last_submitted: appt.claim_last_submission_date
        }
      };
    });

    return new Response(
      JSON.stringify({ success: true, data: formattedAppointments }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (err) {
    console.error('Unexpected error in get-billable-appointments function:', err);
    
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
