
import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface SubmittedClaim {
  id: string;
  start_at: string;
  claim_claimmd_id: string;
  insurance_paid_amount?: number;
  patient_responsibility_amount?: number;
  client: {
    id: string;
    name: string;
    insurance: string;
  };
  provider: {
    id: string;
    name: string;
  };
  service: {
    type: string;
    cpt_code: string;
  };
  billing: {
    amount: number;
    status: string;
    last_submitted: string | null;
  };
}

export function useSubmittedClaimsSimple() {
  const [data, setData] = useState<SubmittedClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchClaims = async () => {
    try {
      console.log('=== SIMPLE HOOK: Starting fetch ===');
      setIsLoading(true);
      setError(null);

      // Get appointments with claims
      const { data: appointments, error: apptError } = await supabase
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
          client_id,
          clinician_id
        `)
        .not('claimid', 'is', null)
        .order('claim_last_submission_date', { ascending: false });

      if (apptError) throw apptError;

      if (!appointments || appointments.length === 0) {
        setData([]);
        return;
      }

      // Get related data
      const clientIds = [...new Set(appointments.map(a => a.client_id))];
      const clinicianIds = [...new Set(appointments.map(a => a.clinician_id))];

      const [{ data: clients }, { data: clinicians }] = await Promise.all([
        supabase.from('clients').select('id, client_first_name, client_last_name, client_insurance_company_primary').in('id', clientIds),
        supabase.from('clinicians').select('id, clinician_first_name, clinician_last_name').in('id', clinicianIds)
      ]);

      // Create maps
      const clientMap = new Map(clients?.map(c => [c.id, c]) || []);
      const clinicianMap = new Map(clinicians?.map(c => [c.id, c]) || []);

      // Transform data
      const formattedClaims: SubmittedClaim[] = appointments.map(appt => {
        const client = clientMap.get(appt.client_id);
        const clinician = clinicianMap.get(appt.clinician_id);

        return {
          id: appt.id,
          start_at: appt.start_at,
          claim_claimmd_id: appt.claimid || '',
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
      });

      console.log('=== SIMPLE HOOK: Successfully formatted claims ===', formattedClaims.length);
      setData(formattedClaims);

    } catch (err) {
      console.error('=== SIMPLE HOOK: Error ===', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, []);

  return {
    data,
    isLoading,
    error,
    refetch: fetchClaims
  };
}
