
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
  }
};
