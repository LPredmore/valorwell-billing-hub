
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Filter, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillableAppointments } from "@/hooks/useClaimsData";
import BillingQueue from "@/components/claims/BillingQueue";
import ClaimDetail from "@/components/claims/ClaimDetail";
import ClaimBatch from "@/components/claims/ClaimBatch";

export default function Claims() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);
  
  const {
    data: billableAppointments,
    isLoading,
    refetch,
    error,
  } = useBillableAppointments();

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
        <Button
          onClick={() => refetch()}
          variant="outline"
          className="gap-2"
        >
          <RefreshCcw size={16} />
          Refresh
        </Button>
      </div>

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
              isLoading={isLoading}
              error={error}
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
                refetch();
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
