
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSubmittedClaims() {
  return useQuery({
    queryKey: ['submittedClaims'],
    queryFn: async () => {
      console.log('=== FETCHING SUBMITTED CLAIMS (FIXED QUERY) ===');
      
      // Query appointments with CMS1500_claims
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          start_at,
          client_id,
          clinician_id,
          CMS1500_claims!inner(
            remote_claimid,
            status,
            last_submission,
            proc_code,
            charge
          )
        `)
        .order('start_at', { ascending: false });

      console.log('=== RAW APPOINTMENTS QUERY RESULT ===');
      console.log('  Error:', error);
      console.log('  Data count:', data?.length || 0);
      console.log('  First appointment:', data?.[0]);

      if (error) {
        console.error('ERROR: Database query failed:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('WARNING: No submitted claims found in database');
        return [];
      }

      // Get unique client and clinician IDs
      const clientIds = [...new Set(data.map(a => a.client_id))];
      const clinicianIds = [...new Set(data.map(a => a.clinician_id))];

      console.log('=== FETCHING RELATED DATA ===');
      console.log('Client IDs:', clientIds);
      console.log('Clinician IDs:', clinicianIds);

      // Fetch clients
      const { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('id, client_first_name, client_last_name, client_insurance_company_primary')
        .in('id', clientIds);

      // Fetch clinicians
      const { data: clinicians, error: clinicianError } = await supabase
        .from('clinicians')
        .select('id, clinician_first_name, clinician_last_name')
        .in('id', clinicianIds);

      if (clientError || clinicianError) {
        console.error('ERROR: Failed to fetch related data:', { clientError, clinicianError });
        throw clientError || clinicianError;
      }

      console.log('=== RELATED DATA FETCHED ===');
      console.log('Clients:', clients?.length || 0);
      console.log('Clinicians:', clinicians?.length || 0);

      // Create lookup maps
      const clientMap = new Map(clients?.map(c => [c.id, c]) || []);
      const clinicianMap = new Map(clinicians?.map(c => [c.id, c]) || []);

      // Transform the data
      const formattedClaims = data
        .filter(appt => appt.CMS1500_claims.length > 0)
        .map((appt, index) => {
          console.log(`\n=== PROCESSING APPOINTMENT ${index + 1}/${data.length} ===`);
          console.log('  Raw appointment:', appt);
          
          const client = clientMap.get(appt.client_id);
          const clinician = clinicianMap.get(appt.clinician_id);
          const claim = appt.CMS1500_claims[0]; // Get first claim
          
          console.log('  Found client:', client);
          console.log('  Found clinician:', clinician);
          console.log('  Found claim:', claim);
          
          const formatted = {
            id: appt.id,
            start_at: appt.start_at,
            claim_claimmd_id: claim.remote_claimid || '',
            insurance_paid_amount: null,
            patient_responsibility_amount: null,
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
              cpt_code: claim.proc_code || '',
            },
            billing: {
              amount: claim.charge || 0,
              status: claim.status || 'Unknown',
              last_submitted: claim.last_submission
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
    staleTime: 0,
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}
