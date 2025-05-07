import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from "lucide-react";

const InsuranceVerification = () => {
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  
  // Fetch clients for verification - Updated query to include all needed fields
  const { data: clients, isLoading: isLoadingClients, refetch } = useQuery({
    queryKey: ['verification-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, client_first_name, client_last_name, client_insurance_company_primary, client_policy_number_primary, eligibility_last_checked_primary, eligibility_status_primary, eligibility_response_details_primary_json, eligibility_copay_primary, eligibility_deductible_primary, eligibility_coinsurance_primary_percent')
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
      setLastError(null);
      
      // Find selected client to verify required information
      const client = clients?.find(c => c.id === clientId);
      
      if (!client?.client_policy_number_primary) {
        setLastError('Missing policy number');
        toast({
          title: 'Missing Information',
          description: 'Client policy number is required for eligibility verification',
          variant: 'destructive',
        });
        return;
      }
      
      // Call our edge function
      const { data, error } = await supabase.functions.invoke('insurance-eligibility', {
        body: { clientId },
      });
      
      if (error) {
        console.error('Eligibility check failed:', error);
        setLastError(error.message);
        toast({
          title: 'Eligibility Check Failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }
      
      if (data.error) {
        console.error('Eligibility API error:', data.error);
        setLastError(data.details || data.error);
        toast({
          title: 'Eligibility Check Error',
          description: data.details || data.error,
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: 'Eligibility Check Complete',
        description: `Status: ${data.eligibility.status}`,
        variant: data.eligibility.status === 'Active' ? 'default' : 'destructive',
      });
      
      // Refresh the client data
      await refetch();
      
    } catch (err) {
      console.error('Error checking eligibility:', err);
      setLastError(err instanceof Error ? err.message : 'An unknown error occurred');
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
      case 'error':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  // Get status icon based on eligibility status
  const getStatusIcon = (status: string | null) => {
    if (!status) return <HelpCircle className="h-5 w-5 text-gray-400" />;
    
    switch(status.toLowerCase()) {
      case 'active':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'inactive':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <HelpCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  // Check if client has all required insurance info for eligibility check
  const hasRequiredInformation = (client: any) => {
    return client.client_insurance_company_primary && client.client_policy_number_primary;
  };

  // Get warning message if client is missing required insurance info
  const getMissingInfoWarning = (client: any) => {
    if (!client.client_insurance_company_primary) {
      return "Missing insurance company";
    }
    if (!client.client_policy_number_primary) {
      return "Missing policy number";
    }
    return null;
  };

  // Get specific error details if available
  const getErrorDetails = (client: any) => {
    if (client?.eligibility_status_primary === 'Error' && 
        client?.eligibility_response_details_primary_json?.error) {
      return client.eligibility_response_details_primary_json.error;
    }
    return null;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Insurance Verification</h1>
        <Button 
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoadingClients}
          className="flex items-center"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh List
        </Button>
      </div>
      
      {lastError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{lastError}</AlertDescription>
        </Alert>
      )}
      
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
          {clients?.map((client) => {
            const warningMessage = getMissingInfoWarning(client);
            const errorDetails = getErrorDetails(client);
            const canCheckEligibility = hasRequiredInformation(client);
            const statusIcon = getStatusIcon(client.eligibility_status_primary);
            
            return (
              <Card key={client.id} className={selectedClientId === client.id ? "border-primary" : ""}>
                <CardHeader>
                  <CardTitle>{client.client_first_name} {client.client_last_name}</CardTitle>
                  <CardDescription>{client.client_insurance_company_primary || 'No insurance on file'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {warningMessage && (
                      <div className="flex items-center text-amber-600 text-sm mb-2">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        <span>{warningMessage}</span>
                      </div>
                    )}
                    {errorDetails && (
                      <div className="flex items-start space-x-2 text-red-600 text-sm mb-2 bg-red-50 p-2 rounded">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">API Error:</span> {errorDetails}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Status:</span>
                      <div className={`flex items-center ${getStatusColor(client.eligibility_status_primary)}`}>
                        {statusIcon}
                        <span className="ml-1">
                          {client.eligibility_status_primary || 'Unknown'}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Last checked:</span>
                      <span className="text-gray-600">{formatDate(client.eligibility_last_checked_primary)}</span>
                    </div>
                    {client.eligibility_status_primary === 'Active' && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-sm font-medium text-gray-700">Benefits:</div>
                        <div className="text-sm grid grid-cols-2 gap-1 mt-1">
                          <span className="text-gray-500">Copay:</span>
                          <span className="text-right">{client.eligibility_copay_primary || 'N/A'}</span>
                          
                          <span className="text-gray-500">Deductible:</span>
                          <span className="text-right">{client.eligibility_deductible_primary || 'N/A'}</span>
                          
                          <span className="text-gray-500">Coinsurance:</span>
                          <span className="text-right">
                            {client.eligibility_coinsurance_primary_percent 
                              ? `${client.eligibility_coinsurance_primary_percent}%` 
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={() => checkEligibility(client.id)} 
                    disabled={isChecking && selectedClientId === client.id || !canCheckEligibility}
                    className="w-full"
                    variant={client.eligibility_status_primary ? "outline" : "default"}
                  >
                    {isChecking && selectedClientId === client.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : !canCheckEligibility ? (
                      'Missing Insurance Info'
                    ) : client.eligibility_status_primary ? (
                      'Recheck Eligibility'
                    ) : (
                      'Check Eligibility'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InsuranceVerification;
