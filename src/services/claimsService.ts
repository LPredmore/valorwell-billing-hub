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
      const { data, error } = await supabase
        .from('appointments')
        .update(billingDetails)
        .eq('id', appointmentId)
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
        .from('appointments')
        .select('claim_status, claim_last_submission_date, claim_response_json, claim_claimmd_id, claim_claimmd_batch_id')
        .eq('id', appointmentId)
        .single();

      if (error) {
        console.error("Error fetching claim history:", error);
        throw error;
      }

      return data;
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
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          insurance_paid_amount,
          insurance_adjustment_amount,
          insurance_adjustment_details_json,
          patient_responsibility_amount,
          era_payment_date,
          era_check_eft_number,
          era_claimmd_id,
          denial_details_json
        `)
        .eq('id', appointmentId)
        .single();

      if (error) {
        console.error("Error fetching ERA payment data:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to fetch ERA payment data:", error);
      throw error;
    }
  },

  /**
   * Retrieves ERA files from Claim.MD
   */
  async retrieveEraFiles() {
    try {
      const { data, error } = await supabase.functions.invoke('era-retrieval', {
        body: {},
      });

      if (error) {
        console.error("Error retrieving ERA files:", error);
        throw error;
      }

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
        .from('appointments')
        .select(`
          era_claimmd_id,
          era_payment_date,
          era_check_eft_number,
          insurance_paid_amount
        `)
        .not('era_claimmd_id', 'is', null)
        .order('era_payment_date', { ascending: false });

      if (error) {
        console.error("Error fetching ERA list:", error);
        throw error;
      }

      // Group by era_claimmd_id to get unique ERA files
      const eraMap = new Map();
      data?.forEach(item => {
        if (!eraMap.has(item.era_claimmd_id)) {
          eraMap.set(item.era_claimmd_id, item);
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
          )
        `)
        .not('era_claimmd_id', 'is', null)
        .is('patient_payment_status', null)
        .order('era_payment_date', { ascending: false });

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
          client_name: clientName
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
      const { data, error } = await supabase
        .from('appointments')
        .update(paymentInfo)
        .eq('id', appointmentId)
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
  }
};
