
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const InsuranceVerification = () => {
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  
  // Fetch clients for verification
  const { data: clients, isLoading: isLoadingClients, refetch } = useQuery({
    queryKey: ['verification-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, client_first_name, client_last_name, client_insurance_company_primary, eligibility_last_checked_primary, eligibility_status_primary')
        .order('client_last_name', { ascending: true });
        
      if (error) throw error;
      return data;
    }
  });
  
  // Function to check eligibility for a client
  const checkEligibility = async (clientId: string) => {
    try {
      setIsChecking(true);
      setSelectedClientId(clientId);
      
      // Call our edge function
      const { data, error } = await supabase.functions.invoke('insurance-eligibility', {
        body: { clientId },
      });
      
      if (error) {
        console.error('Eligibility check failed:', error);
        toast({
          title: 'Eligibility Check Failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: 'Eligibility Check Complete',
        description: `Status: ${data.eligibility.status}`,
        variant: 'default',
      });
      
      // Refresh the client data
      await refetch();
      
    } catch (err) {
      console.error('Error checking eligibility:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  // Helper function to determine status color
  const getStatusColor = (status: string | null) => {
    if (!status) return 'text-gray-500';
    
    switch(status.toLowerCase()) {
      case 'active':
        return 'text-green-600';
      case 'inactive':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Insurance Verification</h1>
        <Button 
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoadingClients}
        >
          Refresh List
        </Button>
      </div>
      
      {isLoadingClients ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading clients...</span>
        </div>
      ) : clients?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">No clients found with insurance information.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients?.map((client) => (
            <Card key={client.id} className={selectedClientId === client.id ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle>{client.client_first_name} {client.client_last_name}</CardTitle>
                <CardDescription>{client.client_insurance_company_primary || 'No insurance on file'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Status:</span>
                    <span className={getStatusColor(client.eligibility_status_primary)}>
                      {client.eligibility_status_primary || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Last checked:</span>
                    <span className="text-gray-600">{formatDate(client.eligibility_last_checked_primary)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={() => checkEligibility(client.id)} 
                  disabled={isChecking && selectedClientId === client.id || !client.client_insurance_company_primary}
                  className="w-full"
                  variant={client.eligibility_status_primary ? "outline" : "default"}
                >
                  {isChecking && selectedClientId === client.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : client.eligibility_status_primary ? (
                    'Recheck Eligibility'
                  ) : (
                    'Check Eligibility'
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default InsuranceVerification;
