
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const Index = () => {
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  
  // Fetch clients for demonstration
  const { data: clients, isLoading: isLoadingClients } = useQuery({
    queryKey: ['clients'],
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
      
      console.log('Eligibility result:', data);
      
      toast({
        title: 'Eligibility Check Complete',
        description: `Status: ${data.eligibility.status}`,
        variant: 'default',
      });
      
      // Refresh the client data
      await clients?.refetch();
      
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

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Insurance Eligibility Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoadingClients ? (
            <p>Loading clients...</p>
          ) : (
            clients?.map((client) => (
              <Card key={client.id} className={selectedClientId === client.id ? "border-blue-500" : ""}>
                <CardHeader>
                  <CardTitle>{client.client_first_name} {client.client_last_name}</CardTitle>
                  <CardDescription>{client.client_insurance_company_primary || 'No insurance on file'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Status:</span>
                      <span className={`${
                        client.eligibility_status_primary === 'Active' ? 'text-green-600' :
                        client.eligibility_status_primary === 'Inactive' ? 'text-red-600' :
                        'text-yellow-600'
                      }`}>
                        {client.eligibility_status_primary || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Last checked:</span>
                      <span>{formatDate(client.eligibility_last_checked_primary)}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={() => checkEligibility(client.id)} 
                    disabled={isChecking && selectedClientId === client.id}
                    className="w-full"
                    variant={client.eligibility_status_primary ? "outline" : "default"}
                  >
                    {isChecking && selectedClientId === client.id 
                      ? 'Checking...' 
                      : client.eligibility_status_primary 
                        ? 'Recheck Eligibility' 
                        : 'Check Eligibility'}
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
