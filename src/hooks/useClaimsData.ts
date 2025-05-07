
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
