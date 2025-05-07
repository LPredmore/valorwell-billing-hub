
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
  }
};
