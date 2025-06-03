import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Filter, RefreshCcw, FileText, AlertCircle, DollarSign, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBillableAppointments, useClaimStatusUpdates, useEraRetrieval } from "@/hooks/useClaimsData";
import { useSubmittedClaims } from "@/hooks/useSubmittedClaims";
import BillingQueue from "@/components/claims/BillingQueue";
import SubmittedClaimsQueue from "@/components/claims/SubmittedClaimsQueue";
import ClaimDetail from "@/components/claims/ClaimDetail";
import ClaimBatch from "@/components/claims/ClaimBatch";
import EraManagement from "@/components/claims/EraManagement";
import SubmittedClaimsTest from "@/components/claims/SubmittedClaimsTest";

export default function Claims() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("billing");
  
  const {
    data: billableAppointments,
    isLoading: isLoadingBillable,
    refetch: refetchBillable,
    error: billableError,
  } = useBillableAppointments();

  const {
    data: submittedClaims,
    isLoading: isLoadingSubmitted,
    refetch: refetchSubmitted,
    error: submittedError,
  } = useSubmittedClaims();

  const { 
    mutate: updateClaimStatuses,
    isPending: isUpdatingStatuses
  } = useClaimStatusUpdates();

  const {
    mutate: retrieveEraFiles,
    isPending: isRetrievingEra
  } = useEraRetrieval();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const filteredAppointments = billableAppointments?.filter((appointment) => {
    const query = searchQuery.toLowerCase();
    return (
      appointment.client.name.toLowerCase().includes(query) ||
      appointment.provider.name.toLowerCase().includes(query) ||
      (appointment.service.cpt_code && appointment.service.cpt_code.toLowerCase().includes(query))
    );
  });

  const handleAppointmentSelect = (appointmentId: string) => {
    setSelectedAppointmentId(appointmentId);
  };

  const handleAppointmentToggle = (appointmentId: string, checked: boolean) => {
    if (checked) {
      setSelectedAppointmentIds((prev) => [...prev, appointmentId]);
    } else {
      setSelectedAppointmentIds((prev) => prev.filter((id) => id !== appointmentId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && filteredAppointments) {
      setSelectedAppointmentIds(filteredAppointments.map((a) => a.id));
    } else {
      setSelectedAppointmentIds([]);
    }
  };

  const handleUpdateStatuses = () => {
    console.log('=== UPDATE STATUSES BUTTON CLICKED ===');
    updateClaimStatuses(undefined, {
      onSuccess: () => {
        console.log('=== STATUS UPDATE SUCCESS - REFRESHING DATA ===');
        // FORCE REFRESH: Explicitly refetch both queries
        refetchBillable();
        refetchSubmitted();
      }
    });
  };

  const handleRetrieveEra = () => {
    retrieveEraFiles(undefined, {
      onSuccess: () => {
        refetchBillable();
        refetchSubmitted();
      }
    });
  };

  const handleRefresh = () => {
    console.log('=== MANUAL REFRESH BUTTON CLICKED ===');
    refetchBillable();
    refetchSubmitted();
  };

  // ENHANCED DEBUG: Log component state
  console.log('=== CLAIMS PAGE RENDER ===');
  console.log('Active tab:', activeTab);
  console.log('Submitted claims count:', submittedClaims?.length || 0);
  console.log('Is loading submitted:', isLoadingSubmitted);
  console.log('Submitted error:', submittedError);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <ClipboardList size={24} />
            Claims Management
          </h1>
          <p className="text-muted-foreground">Prepare and submit claims for billable services</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleUpdateStatuses}
            variant="outline"
            className="gap-2"
            disabled={isUpdatingStatuses}
          >
            {isUpdatingStatuses ? (
              <RefreshCcw size={16} className="animate-spin" />
            ) : (
              <AlertCircle size={16} />
            )}
            Update Statuses
          </Button>
          <Button
            onClick={handleRetrieveEra}
            variant="outline"
            className="gap-2"
            disabled={isRetrievingEra}
          >
            {isRetrievingEra ? (
              <RefreshCcw size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            Process ERA Files
          </Button>
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="gap-2"
          >
            <RefreshCcw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Ready for Submission
          </TabsTrigger>
          <TabsTrigger value="submitted" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Submitted Claims
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Payment Processing
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="billing" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Billing Queue */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle>Billing Queue</CardTitle>
                <CardDescription>Appointments ready for claim submission</CardDescription>
                <div className="flex items-center space-x-2 mt-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search appointments..."
                      value={searchQuery}
                      onChange={handleSearch}
                      className="pl-8"
                    />
                    <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <BillingQueue
                  appointments={filteredAppointments || []}
                  isLoading={isLoadingBillable}
                  error={billableError}
                  selectedAppointmentId={selectedAppointmentId}
                  onAppointmentSelect={handleAppointmentSelect}
                  selectedAppointmentIds={selectedAppointmentIds}
                  onAppointmentToggle={handleAppointmentToggle}
                  onSelectAll={handleSelectAll}
                />
              </CardContent>
            </Card>

            {/* Claim Detail and Batch Submission */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Claim Details</CardTitle>
                <CardDescription>Review and prepare claim for submission</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedAppointmentId ? (
                  <ClaimDetail
                    appointmentId={selectedAppointmentId}
                    onClose={() => setSelectedAppointmentId(null)}
                  />
                ) : (
                  <div className="text-center p-4 text-muted-foreground">
                    <p>Select an appointment to view claim details</p>
                  </div>
                )}
                
                <ClaimBatch
                  selectedAppointmentIds={selectedAppointmentIds}
                  onSuccess={() => {
                    setSelectedAppointmentIds([]);
                    handleRefresh();
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="submitted" className="mt-4">
          <div className="space-y-6">
            {/* Test Component - Remove once working */}
            <SubmittedClaimsTest />
            
            {/* Original Implementation - Hidden for now */}
            <div style={{ display: 'none' }}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle>Submitted Claims</CardTitle>
                    <CardDescription>Claims that have been submitted to the clearinghouse</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SubmittedClaimsQueue
                      appointments={submittedClaims || []}
                      isLoading={isLoadingSubmitted}
                      error={submittedError}
                      selectedAppointmentId={selectedAppointmentId}
                      onAppointmentSelect={handleAppointmentSelect}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Claim Details</CardTitle>
                    <CardDescription>Review submitted claim details and status</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedAppointmentId ? (
                      <ClaimDetail
                        appointmentId={selectedAppointmentId}
                        onClose={() => setSelectedAppointmentId(null)}
                      />
                    ) : (
                      <div className="text-center p-4 text-muted-foreground">
                        <p>Select a submitted claim to view details</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="payments" className="mt-4">
          <EraManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
