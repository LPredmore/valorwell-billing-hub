
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSubmittedClaims() {
  return useQuery({
    queryKey: ['submittedClaims'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          start_at,
          cpt_code,
          billed_amount,
          claim_status,
          claim_claimmd_id,
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
        .not('claim_claimmd_id', 'is', null)
        .order('claim_last_submission_date', { ascending: false });

      if (error) {
        console.error('Error fetching submitted claims:', error);
        throw error;
      }

      // Format the response data
      const formattedClaims = data?.map(appt => {
        const client = appt.clients;
        const clinician = appt.clinicians;
        
        return {
          id: appt.id,
          start_at: appt.start_at,
          claim_claimmd_id: appt.claim_claimmd_id,
          insurance_paid_amount: appt.insurance_paid_amount,
          patient_responsibility_amount: appt.patient_responsibility_amount,
          client: {
            id: client?.id || '',
            name: client ? `${client.client_first_name} ${client.client_last_name}` : 'Unknown',
            insurance: client?.client_insurance_company_primary || ''
          },
          provider: {
            id: clinician?.id || '',
            name: clinician ? `${clinician.clinician_first_name} ${clinician.clinician_last_name}` : 'Unknown'
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
      }) || [];

      return formattedClaims;
    },
    refetchOnWindowFocus: false,
  });
}
