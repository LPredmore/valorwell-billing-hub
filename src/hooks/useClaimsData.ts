
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { claimsService } from "@/services/claimsService";
import { toast } from "@/hooks/use-toast";

/**
 * Hook to fetch billable appointments
 */
export function useBillableAppointments(options = { days: 30, limit: 50, status: 'completed' }) {
  return useQuery({
    queryKey: ['billableAppointments', options],
    queryFn: () => claimsService.getBillableAppointments(options),
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to update appointment billing details
 */
export function useUpdateBillingDetails() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      appointmentId, 
      billingDetails 
    }: { 
      appointmentId: string, 
      billingDetails: any 
    }) => claimsService.updateAppointmentBillingDetails(appointmentId, billingDetails),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billableAppointments'] });
      toast({
        title: "Billing details updated",
        description: "The appointment billing details have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to update billing details",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  });
}

/**
 * Hook to submit claims
 */
export function useClaimSubmission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (appointmentIds: string[]) => claimsService.submitClaims(appointmentIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billableAppointments'] });
      toast({
        title: "Claims submitted successfully",
        description: `Batch ID: ${data.batchId} - ${data.message}`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to submit claims",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  });
}

/**
 * Hook to fetch claim history for an appointment
 */
export function useClaimHistory(appointmentId: string) {
  return useQuery({
    queryKey: ['claimHistory', appointmentId],
    queryFn: () => claimsService.getClaimHistory(appointmentId),
    enabled: !!appointmentId,
  });
}

/**
 * Hook to fetch claim status updates
 */
export function useClaimStatusUpdates() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => claimsService.getClaimResponses(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billableAppointments'] });
      toast({
        title: "Claim statuses updated",
        description: `Retrieved ${data.updatedCount} status updates`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to update claim statuses",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  });
}

/**
 * Hook to fetch ERA payment data for an appointment
 */
export function useEraPaymentData(appointmentId: string) {
  return useQuery({
    queryKey: ['eraPayment', appointmentId],
    queryFn: () => claimsService.getEraPaymentData(appointmentId),
    enabled: !!appointmentId,
  });
}

/**
 * Hook to fetch ERA files
 */
export function useEraRetrieval() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => claimsService.retrieveEraFiles(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billableAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['eraList'] });
      queryClient.invalidateQueries({ queryKey: ['unreconciledPayments'] });
      toast({
        title: "ERA files retrieved",
        description: `Processed ${data.processedCount} ERA files with ${data.paymentCount} payments`,
      });
    },
    onError: (error) => {
      console.error("ERA retrieval error:", error);
      let errorMessage = "Check console for details";
      
      // Try to extract the most useful error information
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Look for specific error codes in the JSON error response
        if (typeof error.message === 'string') {
          if (error.message.includes('"error_code":20') || error.message.includes('AccountKey parameter required')) {
            errorMessage = "API Authentication Error: AccountKey parameter required. Please check the request format and API key configuration.";
          } else if (error.message.includes('"error_code":50') || error.message.includes('No service specified')) {
            errorMessage = "API Error: No service specified. Please verify the endpoint URL format.";
          } else if (error.message.includes('"error_code":30') || error.message.includes('Invalid') && error.message.includes('AccountKey')) {
            errorMessage = "API Authentication Error: Invalid AccountKey. Please verify your API key.";
          }
        }
        
        // Add information about request inspection logs
        errorMessage += " - Complete request details have been logged to the database for inspection.";
      }
      
      toast({
        variant: "destructive",
        title: "Failed to retrieve ERA files",
        description: errorMessage,
      });
    }
  });
}

/**
 * Hook to fetch all ERA files processed
 */
export function useEraList() {
  return useQuery({
    queryKey: ['eraList'],
    queryFn: () => claimsService.getEraList(),
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch payments requiring reconciliation
 */
export function useUnreconciledPayments() {
  return useQuery({
    queryKey: ['unreconciledPayments'],
    queryFn: () => claimsService.getUnreconciledPayments(),
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to manually reconcile a payment
 */
export function useReconcilePayment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      appointmentId, 
      paymentData 
    }: { 
      appointmentId: string, 
      paymentData: any 
    }) => claimsService.updatePaymentInfo(appointmentId, paymentData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unreconciledPayments'] });
      queryClient.invalidateQueries({ queryKey: ['billableAppointments'] });
      toast({
        title: "Payment reconciled",
        description: "The payment has been successfully reconciled.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to reconcile payment",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  });
}
