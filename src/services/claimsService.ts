
import { supabase } from "@/integrations/supabase/client";

/**
 * Service for managing claim-related operations
 */
export const claimsService = {
  /**
   * Fetches appointments that are ready for billing
   */
  async getBillableAppointments(options = { days: 30, limit: 50, status: 'completed' }) {
    try {
      const { data, error } = await supabase.functions.invoke('get-billable-appointments', {
        body: options,
      });

      if (error) {
        console.error("Error fetching billable appointments:", error);
        throw error;
      }

      return data.data || [];
    } catch (error) {
      console.error("Failed to fetch billable appointments:", error);
      throw error;
    }
  },

  /**
   * Updates appointment billing details (CPT code, amount, etc.)
   */
  async updateAppointmentBillingDetails(appointmentId: string, billingDetails: {
    cpt_code?: string;
    modifiers?: string[];
    diagnosis_code_pointers?: string;
    place_of_service_code?: string;
    billed_amount?: number;
  }) {
    try {
      // Update the CMS1500_claims table, not appointments
      const { data, error } = await supabase
        .from('CMS1500_claims')
        .update({
          proc_code: billingDetails.cpt_code,
          mod_1: billingDetails.modifiers?.[0],
          mod_2: billingDetails.modifiers?.[1], 
          mod_3: billingDetails.modifiers?.[2],
          mod_4: billingDetails.modifiers?.[3],
          diag_ref: billingDetails.diagnosis_code_pointers,
          place_of_service: billingDetails.place_of_service_code,
          charge: billingDetails.billed_amount,
          total_charge: billingDetails.billed_amount
        })
        .eq('appointment_id', appointmentId)
        .select();

      if (error) {
        console.error("Error updating appointment billing details:", error);
        throw error;
      }

      return data?.[0];
    } catch (error) {
      console.error("Failed to update appointment billing details:", error);
      throw error;
    }
  },

  /**
   * Submits claims to Claim.MD
   */
  async submitClaims(appointmentIds: string[]) {
    try {
      const { data, error } = await supabase.functions.invoke('claim-submission', {
        body: { appointmentIds },
      });

      if (error) {
        console.error("Error submitting claims:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to submit claims:", error);
      throw error;
    }
  },

  /**
   * Gets claim status history for an appointment
   */
  async getClaimHistory(appointmentId: string) {
    try {
      const { data, error } = await supabase
        .from('CMS1500_claims')
        .select('status, last_submission, response_json, remote_claimid, claim_md_batch_id')
        .eq('appointment_id', appointmentId)
        .single();

      if (error) {
        console.error("Error fetching claim history:", error);
        throw error;
      }

      return {
        claim_status: data.status,
        claim_last_submission_date: data.last_submission,
        claim_response_json: data.response_json,
        claimid: data.remote_claimid,
        claim_claimmd_batch_id: data.claim_md_batch_id
      };
    } catch (error) {
      console.error("Failed to fetch claim history:", error);
      throw error;
    }
  },

  /**
   * Retrieves claim status updates from Claim.MD
   */
  async getClaimResponses() {
    try {
      const { data, error } = await supabase.functions.invoke('claim-response', {
        body: {},  // Will use the last stored ResponseID from settings
      });

      if (error) {
        console.error("Error retrieving claim responses:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to retrieve claim responses:", error);
      throw error;
    }
  },

  /**
   * Gets ERA payment data for a specific appointment
   */
  async getEraPaymentData(appointmentId: string) {
    try {
      // ERA payment data would be stored separately or in CMS1500_claims
      // For now, return basic claim data from CMS1500_claims
      const { data, error } = await supabase
        .from('CMS1500_claims')
        .select(`
          status,
          response_json,
          charge,
          total_charge
        `)
        .eq('appointment_id', appointmentId)
        .single();

      if (error) {
        console.error("Error fetching ERA payment data:", error);
        throw error;
      }

      // Map to expected format
      return {
        insurance_paid_amount: null,
        insurance_adjustment_amount: null,
        insurance_adjustment_details_json: null,
        patient_responsibility_amount: null,
        era_payment_date: null,
        era_check_eft_number: null,
        era_claimmd_id: null,
        denial_details_json: null,
        claim_status: data.status
      };
    } catch (error) {
      console.error("Failed to fetch ERA payment data:", error);
      throw error;
    }
  },

  /**
   * Retrieves ERA files from Claim.MD
   */
  async retrieveEraFiles(dateRange?: { fromDate: string; toDate: string }) {
    try {
      console.log('Retrieving ERA files with date range:', dateRange);
      
      const { data, error } = await supabase.functions.invoke('era-retrieval', {
        body: dateRange || {},
      });

      if (error) {
        console.error("Error retrieving ERA files:", error);
        throw error;
      }

      console.log('ERA retrieval response:', data);
      return data;
    } catch (error) {
      console.error("Failed to retrieve ERA files:", error);
      throw error;
    }
  },

  /**
   * Test the ERA API with specific parameters for debugging
   */
  async testEraApi(testParams: { testNumber?: number, runAllTests?: boolean }) {
    try {
      const { data, error } = await supabase.functions.invoke('era-retrieval', {
        body: testParams,
      });

      if (error) {
        console.error("Error testing ERA API:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to run ERA API tests:", error);
      throw error;
    }
  },

  /**
   * Gets a list of all processed ERA files
   */
  async getEraList() {
    try {
      const { data, error } = await supabase
        .from('CMS1500_claims')
        .select(`
          claim_md_id,
          last_submission,
          status,
          charge
        `)
        .not('claim_md_id', 'is', null)
        .order('last_submission', { ascending: false });

      if (error) {
        console.error("Error fetching ERA list:", error);
        throw error;
      }

      // Group by claim_md_id to get unique ERA files
      const eraMap = new Map();
      data?.forEach(item => {
        if (!eraMap.has(item.claim_md_id)) {
          eraMap.set(item.claim_md_id, {
            era_claimmd_id: item.claim_md_id,
            era_payment_date: item.last_submission,
            era_check_eft_number: null,
            insurance_paid_amount: item.charge
          });
        }
      });

      return Array.from(eraMap.values());
    } catch (error) {
      console.error("Failed to fetch ERA list:", error);
      throw error;
    }
  },

  /**
   * Gets appointments with payments that need reconciliation
   */
  async getUnreconciledPayments() {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          clients (
            id,
            client_first_name,
            client_last_name
          ),
          CMS1500_claims (
            status,
            claim_md_id,
            last_submission,
            charge
          )
        `)
        .not('CMS1500_claims.claim_md_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching unreconciled payments:", error);
        throw error;
      }

      // Process the data to format the client name directly in the result
      const processedData = data?.map(appointment => {
        const clientName = appointment.clients 
          ? `${appointment.clients.client_first_name || ''} ${appointment.clients.client_last_name || ''}`.trim()
          : 'Unknown';
          
        return {
          ...appointment,
          client_name: clientName,
          era_claimmd_id: appointment.CMS1500_claims?.[0]?.claim_md_id,
          era_payment_date: appointment.CMS1500_claims?.[0]?.last_submission,
          claim_status: appointment.CMS1500_claims?.[0]?.status
        };
      });

      return processedData || [];
    } catch (error) {
      console.error("Failed to fetch unreconciled payments:", error);
      throw error;
    }
  },

  /**
   * Updates payment information for an appointment
   */
  async updatePaymentInfo(appointmentId: string, paymentInfo: {
    insurance_paid_amount?: number;
    insurance_adjustment_amount?: number;
    patient_responsibility_amount?: number;
    patient_payment_status?: string;
    patient_paid_amount?: number;
    billing_notes?: string;
  }) {
    try {
      // For now, update the CMS1500_claims table with available fields
      // Payment tracking might need a separate table in the future
      const { data, error } = await supabase
        .from('CMS1500_claims')
        .update({
          // Map payment info to available fields in CMS1500_claims
          response_json: {
            insurance_paid_amount: paymentInfo.insurance_paid_amount,
            insurance_adjustment_amount: paymentInfo.insurance_adjustment_amount,
            patient_responsibility_amount: paymentInfo.patient_responsibility_amount,
            patient_payment_status: paymentInfo.patient_payment_status,
            patient_paid_amount: paymentInfo.patient_paid_amount,
            billing_notes: paymentInfo.billing_notes
          }
        })
        .eq('appointment_id', appointmentId)
        .select();

      if (error) {
        console.error("Error updating payment information:", error);
        throw error;
      }

      return data?.[0];
    } catch (error) {
      console.error("Failed to update payment information:", error);
      throw error;
    }
  },
  
  /**
   * Gets API logs for debugging HTTP requests and responses
   */
  async getApiLogs(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('api_logs')
        .select('*')
        .or('endpoint.eq.era/list,endpoint.eq.era/data,endpoint.eq.raw_request_capture,endpoint.eq.debug_capture')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching API logs:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Failed to fetch API logs:", error);
      throw error;
    }
  },

  /**
   * Gets detailed information for a specific ERA by ID
   */
  async getEraDetail(eraId: string) {
    try {
      const { data, error } = await supabase
        .from('CMS1500_claims')
        .select(`
          id,
          appointment_id,
          claim_md_id,
          last_submission,
          charge,
          total_charge,
          status,
          proc_code,
          response_json,
          appointments (
            id,
            client_id,
            clinician_id,
            clients (
              client_first_name,
              client_last_name
            ),
            clinicians (
              clinician_first_name,
              clinician_last_name
            )
          )
        `)
        .eq('claim_md_id', eraId);

      if (error) {
        console.error(`Error fetching ERA detail for ID ${eraId}:`, error);
        throw error;
      }
      
      // Process the data to add formatted names
      const processedData = data?.map(claim => {
        const appointment = claim.appointments;
        const clientName = appointment?.clients 
          ? `${appointment.clients.client_first_name || ''} ${appointment.clients.client_last_name || ''}`.trim()
          : 'Unknown';
          
        const clinicianName = appointment?.clinicians
          ? `${appointment.clinicians.clinician_first_name || ''} ${appointment.clinicians.clinician_last_name || ''}`.trim()
          : 'Unknown';
          
        return {
          id: appointment?.id,
          era_claimmd_id: claim.claim_md_id,
          era_payment_date: claim.last_submission,
          era_check_eft_number: null,
          insurance_paid_amount: null,
          insurance_adjustment_amount: null,
          patient_responsibility_amount: null,
          claim_status: claim.status,
          cpt_code: claim.proc_code,
          billed_amount: claim.charge,
          client_id: appointment?.client_id,
          clinician_id: appointment?.clinician_id,
          client_name: clientName,
          clinician_name: clinicianName
        };
      });

      return processedData || [];
    } catch (error) {
      console.error(`Failed to fetch ERA detail for ID ${eraId}:`, error);
      throw error;
    }
  }
};
