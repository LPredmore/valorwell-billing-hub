
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Appointment {
  id: string;
  start_at: string;
  client: {
    id: string;
    name: string;
    insurance: string;
  };
  provider: {
    id: string;
    name: string;
  };
  service: {
    type: string;
    cpt_code: string;
    modifiers?: string[];
  };
  billing: {
    amount: number;
    status: string;
    last_submitted: string | null;
  };
}

interface BillingQueueProps {
  appointments: Appointment[];
  isLoading: boolean;
  error: Error | null;
  selectedAppointmentId: string | null;
  selectedAppointmentIds: string[];
  onAppointmentSelect: (appointmentId: string) => void;
  onAppointmentToggle: (appointmentId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
}

export default function BillingQueue({
  appointments,
  isLoading,
  error,
  selectedAppointmentId,
  selectedAppointmentIds,
  onAppointmentSelect,
  onAppointmentToggle,
  onSelectAll,
}: BillingQueueProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedAppointments = appointments.slice(startIndex, endIndex);
  const totalPages = Math.ceil(appointments.length / itemsPerPage);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "submitted to clearinghouse":
        return <Badge variant="secondary">Submitted</Badge>;
      case "accepted":
        return <Badge variant="success">Accepted</Badge>;
      default:
        return <Badge variant="outline">Not Submitted</Badge>;
    }
  };

  const allSelected = appointments.length > 0 && selectedAppointmentIds.length === appointments.length;
  const someSelected = selectedAppointmentIds.length > 0 && selectedAppointmentIds.length < appointments.length;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center rounded-md bg-destructive/10 border border-destructive/20">
        <AlertCircle className="h-10 w-10 text-destructive mb-2" />
        <h3 className="font-medium text-destructive">Failed to load billable appointments</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
        <Button variant="outline" className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox 
                  checked={allSelected} 
                  indeterminate={someSelected && !allSelected}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>CPT</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`loading-${idx}`}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[50px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[70px]" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : displayedAppointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No billable appointments found
                </TableCell>
              </TableRow>
            ) : (
              displayedAppointments.map((appointment) => (
                <TableRow 
                  key={appointment.id}
                  className={selectedAppointmentId === appointment.id ? "bg-muted" : undefined}
                >
                  <TableCell>
                    <Checkbox 
                      checked={selectedAppointmentIds.includes(appointment.id)}
                      onCheckedChange={(checked) => onAppointmentToggle(appointment.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{appointment.client.name}</TableCell>
                  <TableCell>{new Date(appointment.start_at).toLocaleDateString()}</TableCell>
                  <TableCell>{appointment.client.insurance || "No insurance"}</TableCell>
                  <TableCell>{appointment.service.cpt_code || "—"}</TableCell>
                  <TableCell>
                    ${appointment.billing.amount?.toFixed(2) || "0.00"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(appointment.billing.status)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onAppointmentSelect(appointment.id)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center mt-4 space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <div className="flex items-center space-x-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
      
      <div className="text-sm text-muted-foreground">
        {appointments.length} billable appointment{appointments.length !== 1 ? 's' : ''} found
      </div>
    </div>
  );
}
