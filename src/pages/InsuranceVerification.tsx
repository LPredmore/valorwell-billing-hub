import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { 
  Loader2, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  RefreshCw,
  PlusCircle, 
  Calendar,
  DollarSign,
  Percent,
  Info,
  Search,
  ClipboardList,
  UserCheck,
  FileQuestion
} from "lucide-react";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const InsuranceVerification = () => {
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<string | null>(null);
  
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
        
        // Use the user-friendly message if available
        const errorMessage = data.userMessage || data.details || data.error;
        setLastError(errorMessage);
        
        // Show a more informative message based on the response type
        const statusType = determineResponseType(data);
        const toastVariant = getToastVariantByResponseType(statusType);
        
        toast({
          title: 'Eligibility Information Received',
          description: getResponseSummary(data),
          variant: toastVariant,
        });
        return;
      }
      
      const statusType = determineResponseType(data);
      
      toast({
        title: 'Eligibility Check Complete',
        description: `Status: ${data.eligibility.status}`,
        variant: getToastVariantByResponseType(statusType),
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

  // Determine response type - expanded from just Active/Error
  const determineResponseType = (data: any): 'active' | 'not-found' | 'inactive' | 'info-needed' | 'error' | 'unknown' => {
    if (!data) return 'unknown';
    
    // Check for ClaimMD API error codes that indicate specific situations
    if (data.error?.error_code === '75') return 'not-found';
    if (data.error?.error_code === '70') return 'inactive';
    if (data.error?.error_code === '60' || data.error?.error_code === '65') return 'info-needed';
    if (data.error) return 'error';
    
    // For eligibility "status" in the response
    const status = data.eligibility?.status?.toLowerCase();
    if (status === 'active') return 'active';
    if (status === 'inactive') return 'inactive';
    
    return 'unknown';
  }

  // Get a user-friendly summary of the response
  const getResponseSummary = (data: any): string => {
    const responseType = determineResponseType(data);
    
    switch (responseType) {
      case 'active':
        return 'Coverage is active';
      case 'not-found':
        return 'Member not found in insurance database - verify information';
      case 'inactive':
        return 'Coverage is not active';
      case 'info-needed':
        return 'Missing or invalid information';
      case 'error':
        return data.error?.error_mesg || 'Error retrieving coverage details';
      default:
        return 'Unable to determine coverage status';
    }
  };

  // Get toast variant based on response type
  const getToastVariantByResponseType = (responseType: string): 'default' | 'destructive' => {
    switch (responseType) {
      case 'active': return 'default';
      case 'error': return 'destructive';
      default: return 'default'; // Non-active but valid responses aren't "destructive"
    }
  };

  // Helper function to determine status color
  const getStatusColor = (status: string | null, responseType?: string) => {
    if (responseType) {
      switch(responseType) {
        case 'active':
          return 'text-green-600';
        case 'not-found':
        case 'info-needed':
          return 'text-amber-600';
        case 'inactive':
          return 'text-orange-500';
        case 'error':
          return 'text-red-600';
        default:
          return 'text-gray-500';
      }
    }
    
    if (!status) return 'text-gray-500';
    
    switch(status.toLowerCase()) {
      case 'active':
        return 'text-green-600';
      case 'inactive':
        return 'text-orange-500';
      case 'error':
        return 'text-red-600';
      case 'not found':
      case 'info needed':
        return 'text-amber-600';
      default:
        return 'text-yellow-600';
    }
  };

  // Get badge variant based on status
  const getBadgeVariant = (status: string | null): "default" | "secondary" | "destructive" | "outline" => {
    if (!status) return 'outline';
    
    switch(status.toLowerCase()) {
      case 'active':
        return 'default';
      case 'error':
        return 'destructive';
      case 'inactive':
      case 'not found':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Get status icon based on eligibility status or response type
  const getStatusIcon = (status: string | null, responseType?: string) => {
    if (responseType) {
      switch(responseType) {
        case 'active':
          return <CheckCircle2 className="h-5 w-5 text-green-600" />;
        case 'not-found':
          return <Search className="h-5 w-5 text-amber-600" />;
        case 'info-needed':
          return <FileQuestion className="h-5 w-5 text-amber-600" />;
        case 'inactive':
          return <UserCheck className="h-5 w-5 text-orange-500" />;
        case 'error':
          return <AlertCircle className="h-5 w-5 text-red-600" />;
        default:
          return <HelpCircle className="h-5 w-5 text-gray-400" />;
      }
    }
    
    if (!status) return <HelpCircle className="h-5 w-5 text-gray-400" />;
    
    switch(status.toLowerCase()) {
      case 'active':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'inactive':
        return <UserCheck className="h-5 w-5 text-orange-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'pending':
        return <Loader2 className="h-5 w-5 text-amber-600" />;
      case 'not found':
        return <Search className="h-5 w-5 text-amber-600" />;
      default:
        return <HelpCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  // Display status text in a user-friendly way
  const getDisplayStatus = (status: string | null): string => {
    if (!status) return 'Unknown';
    
    // Convert 'Error' status to more specific descriptions based on error code
    if (status.toLowerCase() === 'error') {
      const client = clients?.find(c => c.eligibility_status_primary?.toLowerCase() === 'error');
      if (client) {
        const errorCode = client?.eligibility_response_details_primary_json?.error?.error_code;
        if (errorCode === '75') return 'Not Found';
        if (errorCode === '70') return 'Inactive';
        if (errorCode === '60' || errorCode === '65') return 'Info Needed';
      }
      return 'Error';
    }
    
    return status;
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

  // Get formatted request data that was used in the last check
  const getLastRequestData = (client: any) => {
    if (client?.eligibility_response_details_primary_json?.request_payload) {
      const payload = client.eligibility_response_details_primary_json.request_payload;
      return {
        policyNumber: payload.ins_id,
        insuranceName: payload.ins_name,
        subscriberName: `${payload.ins_name_f} ${payload.ins_name_l}`,
        payerId: payload.payerid,
        serviceDate: payload.fdos,
        relationship: getRelationshipText(payload.pat_rel)
      };
    }
    return null;
  };

  // Get human-readable relationship text based on code
  const getRelationshipText = (relationCode: string) => {
    const relationships: Record<string, string> = {
      "18": "Self",
      "01": "Spouse",
      "19": "Child",
      "G8": "Dependent",
    };
    return relationships[relationCode] || relationCode;
  };

  // Get detailed error reason when possible
  const getDetailedErrorReason = (client: any) => {
    // If explicit error code exists
    if (client?.eligibility_response_details_primary_json?.error?.error_code) {
      const errorCode = client.eligibility_response_details_primary_json.error.error_code;
      switch(errorCode) {
        case '75': return 'Subscriber not found - verify name, DOB and policy number';
        case '67': return 'Patient not found - verify patient details';
        case '70': return 'Insurance not active - verify effective dates';
        case '20': return 'API authentication error';
        case '50': return 'Invalid service requested';
        case '60': return 'Missing required information - check all fields';
        case '65': return 'Invalid insurance information - verify all details';
        case '80': return 'Network error or timeout';
        default: return `Error code: ${errorCode}`;
      }
    }
    
    // Look for error messages in raw response
    if (client?.eligibility_response_details_primary_json?.error?.error_mesg) {
      const errorMessage = client.eligibility_response_details_primary_json.error.error_mesg.toLowerCase();
      
      if (errorMessage.includes('not found')) return 'Member not found - verify name, DOB and policy number';
      if (errorMessage.includes('invalid')) return 'Invalid information provided - check all fields';
      if (errorMessage.includes('inactive')) return 'Coverage inactive - verify effective dates';
      if (errorMessage.includes('missing')) return 'Missing required information - check all fields';
      
      return client.eligibility_response_details_primary_json.error.error_mesg;
    }
    
    return 'Unknown error';
  };

  // Get coverage period if available
  const getCoveragePeriod = (client: any) => {
    // First check if we have plan_date in the eligibility response
    if (client?.eligibility_response_details_primary_json?.elig?.plan_date) {
      const planDate = client.eligibility_response_details_primary_json.elig.plan_date;
      if (planDate.includes('-')) {
        const [start, end] = planDate.split('-');
        return {
          startDate: formatApiDate(start),
          endDate: formatApiDate(end),
        };
      } else {
        return {
          startDate: null,
          endDate: null,
        };
      }
    }
    
    // Otherwise check in the benefits array
    if (client?.eligibility_response_details_primary_json?.elig?.benefit) {
      const benefits = client.eligibility_response_details_primary_json.elig.benefit;
      
      // Look for plan date entries
      const coverageBenefit = benefits.find((benefit: any) => 
        benefit.benefit_information?.includes('plan date') || 
        benefit.benefit_coverage_description?.toLowerCase().includes('eligibility begin')
      );
      
      if (coverageBenefit) {
        // Try to extract dates from various fields
        return {
          startDate: coverageBenefit.benefit_eligibility_start || coverageBenefit.benefit_begin_date,
          endDate: coverageBenefit.benefit_eligibility_end || coverageBenefit.benefit_end_date,
        };
      }
    }
    
    return null;
  };

  // Format the API date (assumes YYYYMMDD format)
  const formatApiDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null;
    // Handle YYYYMMDD format
    if (dateStr.length === 8) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  };

  // Get demographic info returned in the eligibility response
  const getDemographicInfo = (client: any) => {
    const elig = client?.eligibility_response_details_primary_json?.elig;
    if (!elig) return null;
    
    return {
      firstName: elig.ins_name_f,
      lastName: elig.ins_name_l,
      dob: elig.ins_dob ? formatApiDate(elig.ins_dob) : null,
      gender: elig.ins_sex,
      policyNumber: elig.ins_number || elig.ins_id,
    };
  };

  // Get plan name from response data
  const getPlanName = (client: any) => {
    if (client?.eligibility_response_details_primary_json?.elig) {
      return client.eligibility_response_details_primary_json.elig.plan_name || 
             client.eligibility_response_details_primary_json.elig.plan_description || 
             client.eligibility_response_details_primary_json.elig.plan_number;
    }
    
    return null;
  };

  // Get network status (in/out of network)
  const getNetworkStatus = (client: any) => {
    if (client?.eligibility_response_details_primary_json?.elig?.benefit) {
      const benefits = client.eligibility_response_details_primary_json.elig.benefit;
      
      // Check for in-network specifically for service code 98 (Mental Health)
      const networkBenefit = benefits.find((benefit: any) => 
        benefit.benefit_code === '98' && 
        benefit.benefit_network_ind
      );
      
      if (networkBenefit) {
        return networkBenefit.benefit_network_ind === 'Y' ? 'In Network' : 'Out of Network';
      }
    }
    
    return 'Network status unknown';
  };

  // Get additional benefit details
  const getAdditionalBenefits = (client: any) => {
    const benefits = [];
    
    if (client?.eligibility_response_details_primary_json?.elig?.benefit) {
      const rawBenefits = client.eligibility_response_details_primary_json.elig.benefit;
      
      // Look for specific mental health benefits
      const mentalHealthBenefits = rawBenefits.filter((benefit: any) => 
        benefit.benefit_code === '98' || 
        (benefit.benefit_coverage_description && 
          (benefit.benefit_coverage_description.toLowerCase().includes('mental') || 
           benefit.benefit_coverage_description.toLowerCase().includes('behavioral')))
      );
      
      // Process each benefit for display
      mentalHealthBenefits.forEach((benefit: any) => {
        // Skip if we don't have a meaningful description
        if (!benefit.benefit_coverage_description) return;
        
        const benefitInfo = {
          description: benefit.benefit_coverage_description,
          amount: benefit.benefit_amount || benefit.benefit_percent || null,
          network: benefit.benefit_network_ind === 'Y' ? 'In Network' : 
                  benefit.benefit_network_ind === 'N' ? 'Out of Network' : null,
          coverageLevel: benefit.benefit_coverage_level || null,
        };
        
        benefits.push(benefitInfo);
      });
    }
    
    return benefits.length > 0 ? benefits : null;
  };

  // Get remaining deductible information if available
  const getDeductibleInfo = (client: any) => {
    if (!client?.eligibility_response_details_primary_json?.elig?.benefit) {
      return null;
    }
    
    const benefits = client.eligibility_response_details_primary_json.elig.benefit;
    let deductibleInfo = null;
    
    // Look for deductible information
    const deductibleBenefit = benefits.find((benefit: any) => 
      (benefit.benefit_coverage_description && 
       benefit.benefit_coverage_description.toLowerCase().includes('deductible'))
    );
    
    if (deductibleBenefit) {
      deductibleInfo = {
        total: deductibleBenefit.benefit_amount || client.eligibility_deductible_primary || null,
        remaining: deductibleBenefit.benefit_remaining || null,
        type: deductibleBenefit.benefit_coverage_description || 'Deductible',
      };
    }
    
    return deductibleInfo;
  };
  
  // Get response type for a client
  const getClientResponseType = (client: any) => {
    if (!client?.eligibility_response_details_primary_json) return 'unknown';
    
    // Check for specific error codes that indicate status rather than errors
    if (client.eligibility_status_primary === 'Error') {
      const errorCode = client.eligibility_response_details_primary_json?.error?.error_code;
      if (errorCode === '75') return 'not-found';
      if (errorCode === '70') return 'inactive';
      if (errorCode === '60' || errorCode === '65') return 'info-needed';
      return 'error';
    }
    
    if (client.eligibility_status_primary === 'Active') return 'active';
    if (client.eligibility_status_primary === 'Inactive') return 'inactive';
    
    return 'unknown';
  };

  // Get verification information for display
  const getVerificationInfo = (client: any) => {
    const responseType = getClientResponseType(client);
    const demoInfo = getDemographicInfo(client);
    
    // Active status shows regular benefits 
    if (responseType === 'active') {
      return null;
    }
    
    // For not-found, show the request data vs what was found
    if (responseType === 'not-found') {
      const requestData = getLastRequestData(client);
      if (!requestData) return null;
      
      return {
        type: 'not-found',
        requested: {
          name: requestData.subscriberName,
          policy: requestData.policyNumber,
        },
        returned: demoInfo ? {
          name: demoInfo.firstName && demoInfo.lastName ? 
            `${demoInfo.firstName} ${demoInfo.lastName}` : 'No name returned',
          policy: demoInfo.policyNumber || 'No policy returned',
        } : null
      };
    }
    
    // For inactive, show coverage period if available
    if (responseType === 'inactive') {
      const coveragePeriod = getCoveragePeriod(client);
      
      return {
        type: 'inactive',
        coverage: coveragePeriod,
        name: demoInfo?.firstName && demoInfo?.lastName ? 
          `${demoInfo.firstName} ${demoInfo.lastName}` : null
      };
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
            const detailedErrorReason = client.eligibility_status_primary === 'Error' ? getDetailedErrorReason(client) : null;
            const canCheckEligibility = hasRequiredInformation(client);
            const responseType = getClientResponseType(client);
            const statusIcon = getStatusIcon(client.eligibility_status_primary, responseType);
            const lastRequestData = getLastRequestData(client);
            const coveragePeriod = getCoveragePeriod(client);
            const planName = getPlanName(client);
            const networkStatus = client.eligibility_status_primary === 'Active' ? getNetworkStatus(client) : null;
            const additionalBenefits = client.eligibility_status_primary === 'Active' ? getAdditionalBenefits(client) : null;
            const deductibleInfo = client.eligibility_status_primary === 'Active' ? getDeductibleInfo(client) : null;
            const isExpanded = expandedDetails === client.id;
            const displayStatus = getDisplayStatus(client.eligibility_status_primary);
            const verificationInfo = getVerificationInfo(client);
            const demographicInfo = getDemographicInfo(client);
            
            return (
              <Card key={client.id} className={selectedClientId === client.id ? "border-primary" : ""}>
                <CardHeader className="flex flex-row justify-between items-start space-y-0 pb-2">
                  <div>
                    <CardTitle>{client.client_first_name} {client.client_last_name}</CardTitle>
                    <CardDescription className="mt-1">
                      {client.client_insurance_company_primary || 'No insurance on file'}
                    </CardDescription>
                  </div>
                  {client.eligibility_status_primary && (
                    <Badge 
                      variant={getBadgeVariant(displayStatus)}
                      className="ml-2 text-xs"
                    >
                      {displayStatus}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {warningMessage && (
                      <div className="flex items-center text-amber-600 text-sm mb-2">
                        <AlertTriangle className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span>{warningMessage}</span>
                      </div>
                    )}
                    
                    {responseType === 'not-found' && (
                      <Alert variant="default" className="bg-amber-50 text-amber-800 border-amber-200 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-amber-800">Subscriber Not Found</AlertTitle>
                        <AlertDescription className="text-sm text-amber-700">
                          The insurance company could not find this member. Verify the policy number, 
                          name spelling, and date of birth.
                        </AlertDescription>
                      </Alert>
                    )}

                    {responseType === 'inactive' && (
                      <Alert variant="default" className="bg-orange-50 text-orange-800 border-orange-200 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-orange-800">Coverage Not Active</AlertTitle>
                        <AlertDescription className="text-sm text-orange-700">
                          {verificationInfo?.coverage ? 
                            `Coverage dates: ${verificationInfo.coverage.startDate || 'Unknown'} to ${verificationInfo.coverage.endDate || 'Unknown'}` : 
                            'The policy is not currently active. Verify effective dates.'}
                        </AlertDescription>
                      </Alert>
                    )}

                    {responseType === 'info-needed' && (
                      <Alert variant="default" className="bg-amber-50 text-amber-800 border-amber-200 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-amber-800">Additional Information Needed</AlertTitle>
                        <AlertDescription className="text-sm text-amber-700">
                          {detailedErrorReason || 'Missing or invalid information was provided. Please verify all insurance details.'}
                        </AlertDescription>
                      </Alert>
                    )}

                    {responseType === 'error' && detailedErrorReason && (
                      <div className="flex items-start space-x-2 text-red-600 text-sm mb-2 bg-red-50 p-2 rounded">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">Error:</span> {detailedErrorReason}
                          {errorDetails && <div className="mt-1 text-xs opacity-80">{errorDetails.error_mesg}</div>}
                        </div>
                      </div>
                    )}

                    {/* Information returned from API - always show, even for "errors" */}
                    {demographicInfo && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-sm font-medium text-gray-700 mb-1">Information from Insurance:</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                          {demographicInfo.firstName && demographicInfo.lastName && (
                            <>
                              <span className="text-gray-500">Name:</span>
                              <span>
                                {demographicInfo.firstName} {demographicInfo.lastName}
                              </span>
                            </>
                          )}
                          
                          {demographicInfo.policyNumber && (
                            <>
                              <span className="text-gray-500">Policy:</span>
                              <span>{demographicInfo.policyNumber}</span>
                            </>
                          )}
                          
                          {demographicInfo.dob && (
                            <>
                              <span className="text-gray-500">DOB:</span>
                              <span>{new Date(demographicInfo.dob).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="font-medium">Status:</span>
                      <div className={`flex items-center ${getStatusColor(client.eligibility_status_primary, responseType)}`}>
                        {statusIcon}
                        <span className="ml-1">
                          {displayStatus || 'Unknown'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="font-medium">Last checked:</span>
                      <span className="text-gray-600">{formatDate(client.eligibility_last_checked_primary)}</span>
                    </div>

                    {/* Display relationship information */}
                    {lastRequestData && lastRequestData.relationship && (
                      <div className="flex justify-between">
                        <span className="font-medium">Relationship:</span>
                        <span className="text-gray-600">{lastRequestData.relationship}</span>
                      </div>
                    )}

                    {/* Show plan name if available */}
                    {planName && (
                      <div className="flex justify-between">
                        <span className="font-medium">Plan:</span>
                        <span className="text-gray-600">{planName}</span>
                      </div>
                    )}

                    {/* Show coverage period if available */}
                    {coveragePeriod && (
                      <div className="flex justify-between">
                        <span className="font-medium">Coverage period:</span>
                        <span className="text-gray-600">
                          {coveragePeriod.startDate ? 
                            new Date(coveragePeriod.startDate).toLocaleDateString() : 'Unknown'} - {coveragePeriod.endDate ? 
                            new Date(coveragePeriod.endDate).toLocaleDateString() : 'Current'}
                        </span>
                      </div>
                    )}

                    {/* Show network status if active */}
                    {networkStatus && (
                      <div className="flex justify-between">
                        <span className="font-medium">Network status:</span>
                        <span className="text-gray-600">{networkStatus}</span>
                      </div>
                    )}
                    
                    {client.eligibility_status_primary === 'Active' && (
                      <>
                        {/* Display basic benefits information */}
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="text-sm font-medium text-gray-700">Benefits:</div>
                          <div className="text-sm grid grid-cols-2 gap-1 mt-1">
                            <span className="text-gray-500 flex items-center">
                              <DollarSign className="h-3 w-3 mr-1" />Copay:
                            </span>
                            <span className="text-right">
                              {client.eligibility_copay_primary ? 
                                `$${client.eligibility_copay_primary}` : 'N/A'}
                            </span>
                            
                            <span className="text-gray-500 flex items-center">
                              <DollarSign className="h-3 w-3 mr-1" />Deductible:
                            </span>
                            <span className="text-right">
                              {client.eligibility_deductible_primary ? 
                                `$${client.eligibility_deductible_primary}` : 'N/A'}
                              {deductibleInfo?.remaining && 
                                ` (${deductibleInfo.remaining} remaining)`}
                            </span>
                            
                            <span className="text-gray-500 flex items-center">
                              <Percent className="h-3 w-3 mr-1" />Coinsurance:
                            </span>
                            <span className="text-right">
                              {client.eligibility_coinsurance_primary_percent 
                                ? `${client.eligibility_coinsurance_primary_percent}%` 
                                : 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Add collapsible for additional benefits */}
                        {additionalBenefits && additionalBenefits.length > 0 && (
                          <Collapsible
                            open={isExpanded}
                            onOpenChange={() => setExpandedDetails(isExpanded ? null : client.id)}
                            className="mt-2 border-t border-gray-100 pt-2"
                          >
                            <CollapsibleTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-xs w-full flex items-center justify-between p-1 h-auto"
                              >
                                <span>Additional Benefits</span>
                                <PlusCircle className="h-3 w-3 flex-shrink-0" />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="text-xs space-y-2 mt-2">
                              {additionalBenefits.map((benefit: any, index: number) => (
                                <div key={index} className="border-b border-gray-100 pb-1">
                                  <div className="font-medium">{benefit.description}</div>
                                  {benefit.amount && (
                                    <div>
                                      Amount: {typeof benefit.amount === 'number' && benefit.amount > 0 ? 
                                        `$${benefit.amount}` : benefit.amount}
                                    </div>
                                  )}
                                  {benefit.network && <div>Network: {benefit.network}</div>}
                                </div>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {/* View full details dialog */}
                        {client.eligibility_response_details_primary_json && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="link" size="sm" className="text-xs px-0 mt-1 h-auto">
                                <Info className="h-3 w-3 mr-1" />
                                View all data
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                              <DialogHeader>
                                <DialogTitle>Full Eligibility Response</DialogTitle>
                              </DialogHeader>
                              <div className="mt-4 text-xs">
                                <pre className="whitespace-pre-wrap bg-muted p-4 rounded overflow-auto max-h-96">
                                  {JSON.stringify(client.eligibility_response_details_primary_json, null, 2)}
                                </pre>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </>
                    )}

                    {/* For non-active responses, show what was requested vs what was found */}
                    {(responseType === 'not-found' || responseType === 'info-needed') && lastRequestData && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="font-medium mb-1 text-sm">Submitted Information:</div>
                        <div className="grid grid-cols-2 gap-1 text-sm">
                          <span className="text-gray-500">Policy Number:</span>
                          <span className="font-mono">{lastRequestData.policyNumber}</span>
                          
                          <span className="text-gray-500">Name:</span>
                          <span>{lastRequestData.subscriberName}</span>
                          
                          <span className="text-gray-500">Relationship:</span>
                          <span>{lastRequestData.relationship}</span>
                          
                          {lastRequestData.payerId && (
                            <>
                              <span className="text-gray-500">Payer ID:</span>
                              <span className="font-mono">{lastRequestData.payerId}</span>
                            </>
                          )}
                        </div>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="mt-2 text-xs text-blue-600 flex items-center cursor-help">
                                <Info className="h-3 w-3 mr-1" />
                                <span>Tips for resolving</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">
                                For "Not Found" responses, verify:
                                <br />• Exact spelling of name
                                <br />• Correct DOB format
                                <br />• Policy number (including all hyphens or prefixes)
                                <br />• Relationship to subscriber
                                <br />• Insurance company selected
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}

                    {/* Show request data for errors */}
                    {responseType === 'error' && lastRequestData && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                        <div className="font-medium mb-1">Last request data:</div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-gray-500">Policy:</span>
                          <span>{lastRequestData.policyNumber}</span>
                          
                          <span className="text-gray-500">Subscriber:</span>
                          <span>{lastRequestData.subscriberName}</span>
                          
                          <span className="text-gray-500">Relationship:</span>
                          <span>{lastRequestData.relationship}</span>
                          
                          <span className="text-gray-500">Payer ID:</span>
                          <span>{lastRequestData.payerId || 'Not provided'}</span>
                          
                          <span className="text-gray-500">Service Date:</span>
                          <span>
                            {lastRequestData.serviceDate ? 
                              formatDate(lastRequestData.serviceDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) : 
                              'Not provided'}
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
