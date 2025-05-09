
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
 * Hook to run specific API tests for ERA retrieval debugging
 */
export function useEraApiTest() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      testNumber, 
      runAllTests = false 
    }: { 
      testNumber?: number, 
      runAllTests?: boolean 
    }) => {
      if (runAllTests) {
        return claimsService.testEraApi({ runAllTests: true });
      } else if (testNumber !== undefined) {
        return claimsService.testEraApi({ testNumber });
      } else {
        throw new Error("Either testNumber or runAllTests must be provided");
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apiLogs'] });
      toast({
        title: "ERA API Test Complete",
        description: `Test ${data.testResults ? "suite" : "case"} executed successfully`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "ERA API Test Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
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
      queryClient.invalidateQueries({ queryKey: ['apiLogs'] }); 
      
      // Format message based on the number of processed ERAs
      let description = "No new ERA files to process";
      
      if (data.processedCount > 0) {
        description = `Processed ${data.processedCount} ERA files with ${data.paymentCount} payments`;
      }
      
      toast({
        title: "ERA files retrieved",
        description,
      });
    },
    onError: (error) => {
      console.error("ERA retrieval error:", error);
      let errorMessage = "Check console and API logs for details";
      
      // Try to extract the most useful error information
      if (error instanceof Error) {
        // Extract more meaningful error messages
        errorMessage = error.message;
        
        // Handle specific error patterns
        if (typeof error.message === 'string') {
          if (error.message.includes('date') && error.message.includes('format')) {
            errorMessage = "Date format error: Please ensure dates are formatted correctly (MM-DD-YYYY)";
          }
          else if (error.message.includes('parameter') || error.message.includes('Parameter')) {
            errorMessage = "Parameter error: Please verify the correct parameter names are being used";
          }
          else if (error.message.includes('AccountKey') || error.message.includes('Authentication')) {
            errorMessage = "Authentication error: Please verify your API key";
          }
          else if (error.message.includes('not found') || error.message.includes('404')) {
            errorMessage = "Endpoint error: Please verify the API endpoint URL";
          }
        }
        
        // Add information about request inspection logs
        errorMessage += " - Check API logs for detailed request information";
      }
      
      // Invalidate API logs to ensure fresh data after an error
      queryClient.invalidateQueries({ queryKey: ['apiLogs'] });
      
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
 * Hook to fetch detailed information for a specific ERA
 */
export function useEraDetail(eraId: string) {
  return useQuery({
    queryKey: ['eraDetail', eraId],
    queryFn: () => claimsService.getEraDetail(eraId),
    enabled: !!eraId,
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
      queryClient.invalidateQueries({ queryKey: ['eraDetail'] });
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

/**
 * Hook to fetch API logs for debugging
 */
export function useApiLogs(limit = 50) {
  return useQuery({
    queryKey: ['apiLogs', limit],
    queryFn: () => claimsService.getApiLogs(limit),
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}
