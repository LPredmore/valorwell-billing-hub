
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
          cpt_code,
          modifiers,
          diagnosis_code_pointers,
          place_of_service_code,
          billed_amount,
          claim_status,
          claimid,
          claim_last_submission_date,
          claim_status_last_checked,
          claim_response_json,
          denial_details_json,
          insurance_paid_amount,
          patient_responsibility_amount,
          insurance_adjustment_amount,
          insurance_adjustment_details_json,
          era_payment_date,
          era_check_eft_number,
          era_claimmd_id,
          billing_notes,
          client_id,
          clinician_id
        `)
        .not('claimid', 'is', null)
        .order('claim_last_submission_date', { ascending: false });

      if (error) {
        console.error('ERROR: Database query failed:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('WARNING: No submitted claims found');
        return [];
      }

      // Get unique client and clinician IDs
      const clientIds = [...new Set(data.map(a => a.client_id))];
      const clinicianIds = [...new Set(data.map(a => a.clinician_id))];

      // Fetch clients and clinicians
      const [clientsResult, cliniciansResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, client_first_name, client_last_name, client_insurance_company_primary')
          .in('id', clientIds),
        supabase
          .from('clinicians')
          .select('id, clinician_first_name, clinician_last_name')
          .in('id', clinicianIds)
      ]);

      if (clientsResult.error || cliniciansResult.error) {
        console.error('ERROR: Failed to fetch related data');
        throw clientsResult.error || cliniciansResult.error;
      }

      // Create lookup maps
      const clientMap = new Map(clientsResult.data?.map(c => [c.id, c]) || []);
      const clinicianMap = new Map(cliniciansResult.data?.map(c => [c.id, c]) || []);

      // Transform the data into enhanced format
      const enhancedClaims: EnhancedSubmittedClaim[] = data.map(appt => {
        const client = clientMap.get(appt.client_id);
        const clinician = clinicianMap.get(appt.clinician_id);
        
        return {
          id: appt.id,
          start_at: appt.start_at,
          claim_claimmd_id: appt.claimid || '',
          
          client: {
            id: client?.id || '',
            name: client ? `${client.client_first_name || ''} ${client.client_last_name || ''}`.trim() : 'Unknown Client',
            insurance: client?.client_insurance_company_primary || ''
          },
          
          provider: {
            id: clinician?.id || '',
            name: clinician ? `${clinician.clinician_first_name || ''} ${clinician.clinician_last_name || ''}`.trim() : 'Unknown Provider'
          },
          
          clinical: {
            cpt_code: appt.cpt_code || '',
            modifiers: appt.modifiers || [],
            diagnosis_code_pointers: appt.diagnosis_code_pointers || '',
            place_of_service_code: appt.place_of_service_code || ''
          },
          
          financial: {
            billed_amount: appt.billed_amount || 0,
            insurance_paid_amount: appt.insurance_paid_amount,
            patient_responsibility_amount: appt.patient_responsibility_amount,
            insurance_adjustment_amount: appt.insurance_adjustment_amount,
            insurance_adjustment_details: appt.insurance_adjustment_details_json
          },
          
          status: {
            claim_status: appt.claim_status || 'Unknown',
            last_submission_date: appt.claim_last_submission_date,
            last_status_check: appt.claim_status_last_checked,
            response_details: appt.claim_response_json,
            denial_details: appt.denial_details_json
          },
          
          payment: {
            era_payment_date: appt.era_payment_date,
            era_check_eft_number: appt.era_check_eft_number,
            era_claimmd_id: appt.era_claimmd_id
          },
          
          notes: {
            billing_notes: appt.billing_notes
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
