
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSubmittedClaims() {
  return useQuery({
    queryKey: ['submittedClaims'],
    queryFn: async () => {
      console.log('=== FETCHING SUBMITTED CLAIMS (ENHANCED DEBUG) ===');
      
      // Query appointments that have a claimid (meaning they've been submitted)
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          start_at,
          cpt_code,
          billed_amount,
          claim_status,
          claimid,
          claim_last_submission_date,
          insurance_paid_amount,
          patient_responsibility_amount,
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
        .not('claimid', 'is', null)
        .order('claim_last_submission_date', { ascending: false });

      console.log('=== RAW DATABASE QUERY RESULT ===');
      console.log('  Error:', error);
      console.log('  Data count:', data?.length || 0);
      console.log('  First 3 records:', data?.slice(0, 3));

      if (error) {
        console.error('ERROR: Database query failed:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('WARNING: No submitted claims found in database');
        return [];
      }

      // SIMPLIFIED DATA TRANSFORMATION with extensive debugging
      const formattedClaims = data.map((appt, index) => {
        console.log(`\n=== PROCESSING APPOINTMENT ${index + 1}/${data.length} ===`);
        console.log('  Raw appointment:', appt);
        
        const client = appt.clients;
        const clinician = appt.clinicians;
        
        // Validate required data
        if (!client) {
          console.warn(`  WARNING: No client data for appointment ${appt.id}`);
        }
        if (!clinician) {
          console.warn(`  WARNING: No clinician data for appointment ${appt.id}`);
        }
        if (!appt.claimid) {
          console.warn(`  WARNING: No claimid for appointment ${appt.id}`);
        }
        
        const formatted = {
          id: appt.id,
          start_at: appt.start_at,
          claim_claimmd_id: appt.claimid || '', // CRITICAL: Map claimid to expected UI property
          insurance_paid_amount: appt.insurance_paid_amount,
          patient_responsibility_amount: appt.patient_responsibility_amount,
          client: {
            id: client?.id || '',
            name: client ? `${client.client_first_name || ''} ${client.client_last_name || ''}`.trim() : 'Unknown Client',
            insurance: client?.client_insurance_company_primary || ''
          },
          provider: {
            id: clinician?.id || '',
            name: clinician ? `${clinician.clinician_first_name || ''} ${clinician.clinician_last_name || ''}`.trim() : 'Unknown Provider'
          },
          service: {
            type: 'therapy_session',
            cpt_code: appt.cpt_code || '',
          },
          billing: {
            amount: appt.billed_amount || 0,
            status: appt.claim_status || 'Unknown',
            last_submitted: appt.claim_last_submission_date
          }
        };
        
        console.log('  FORMATTED RESULT:');
        console.log('    claim_claimmd_id:', formatted.claim_claimmd_id);
        console.log('    client.name:', formatted.client.name);
        console.log('    billing.status:', formatted.billing.status);
        console.log('    billing.amount:', formatted.billing.amount);
        
        return formatted;
      });

      console.log('\n=== FINAL TRANSFORMATION RESULTS ===');
      console.log(`Total claims formatted: ${formattedClaims.length}`);
      console.log('Claims with claimid:', formattedClaims.filter(c => c.claim_claimmd_id).length);
      console.log('Claims with status:', formattedClaims.filter(c => c.billing.status !== 'Unknown').length);
      console.log('Sample formatted data:', formattedClaims.slice(0, 2));
      
      return formattedClaims;
    },
    refetchOnWindowFocus: false,
    // FORCE FRESH DATA: Reduce stale time to ensure fresh fetches
    staleTime: 0,
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}
