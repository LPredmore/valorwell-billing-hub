
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface EnhancedSubmittedClaim {
  id: string;
  start_at: string;
  claim_claimmd_id: string;
  
  // Client information
  client: {
    id: string;
    name: string;
    insurance: string;
  };
  
  // Provider information
  provider: {
    id: string;
    name: string;
  };
  
  // Clinical information
  clinical: {
    cpt_code: string;
    modifiers: string[];
    diagnosis_code_pointers: string;
    place_of_service_code: string;
  };
  
  // Financial information
  financial: {
    billed_amount: number;
    insurance_paid_amount: number | null;
    patient_responsibility_amount: number | null;
    insurance_adjustment_amount: number | null;
    insurance_adjustment_details: any;
  };
  
  // Status and response information
  status: {
    claim_status: string;
    last_submission_date: string | null;
    last_status_check: string | null;
    response_details: any;
    denial_details: any;
  };
  
  // ERA and payment information
  payment: {
    era_payment_date: string | null;
    era_check_eft_number: string | null;
    era_claimmd_id: string | null;
  };
  
  // Additional information
  notes: {
    billing_notes: string | null;
  };
}

export function useEnhancedSubmittedClaims() {
  return useQuery({
    queryKey: ['enhancedSubmittedClaims'],
    queryFn: async () => {
      console.log('=== FETCHING ENHANCED SUBMITTED CLAIMS ===');
      
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          start_at,
          notes,
          client_id,
          clinician_id,
          clients:client_id(
            client_first_name,
            client_last_name,
            client_insurance_company_primary
          ),
          clinicians:clinician_id(
            clinician_first_name,
            clinician_last_name
          ),
          CMS1500_claims!inner(
            remote_claimid,
            status,
            last_submission,
            last_status_check,
            claim_md_batch_id,
            proc_code,
            mod_1,
            mod_2,
            mod_3,
            mod_4,
            place_of_service,
            diag_ref,
            charge,
            response_json
          )
        `)
        .order('start_at', { ascending: false });

      if (error) {
        console.error('ERROR: Database query failed:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('WARNING: No submitted claims found');
        return [];
      }

      console.log(`Found ${data.length} appointments with claims`);

      // Transform the data into enhanced format
      const enhancedClaims: EnhancedSubmittedClaim[] = data
        .filter(appt => appt.CMS1500_claims.length > 0)
        .map(appt => {
          const claim = appt.CMS1500_claims[0]; // Get first claim
          const modifiers = [claim.mod_1, claim.mod_2, claim.mod_3, claim.mod_4].filter(Boolean);
          
          return {
            id: appt.id,
            start_at: appt.start_at,
            claim_claimmd_id: claim.remote_claimid || '',
            
            client: {
              id: appt.client_id,
              name: appt.clients ? `${appt.clients.client_first_name || ''} ${appt.clients.client_last_name || ''}`.trim() : 'Unknown Client',
              insurance: appt.clients?.client_insurance_company_primary || ''
            },
            
            provider: {
              id: appt.clinician_id,
              name: appt.clinicians ? `${appt.clinicians.clinician_first_name || ''} ${appt.clinicians.clinician_last_name || ''}`.trim() : 'Unknown Provider'
            },
            
            clinical: {
              cpt_code: claim.proc_code || '',
              modifiers: modifiers,
              diagnosis_code_pointers: claim.diag_ref || '',
              place_of_service_code: claim.place_of_service || ''
            },
            
            financial: {
              billed_amount: claim.charge || 0,
              insurance_paid_amount: null,
              patient_responsibility_amount: null,
              insurance_adjustment_amount: null,
              insurance_adjustment_details: null
            },
            
            status: {
              claim_status: claim.status || 'Unknown',
              last_submission_date: claim.last_submission,
              last_status_check: claim.last_status_check,
              response_details: claim.response_json,
              denial_details: null
            },
            
            payment: {
              era_payment_date: null,
              era_check_eft_number: null,
              era_claimmd_id: null
            },
            
            notes: {
              billing_notes: appt.notes
            }
          };
        });

      console.log(`=== ENHANCED CLAIMS PROCESSED: ${enhancedClaims.length} ===`);
      return enhancedClaims;
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });
}
