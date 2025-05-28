
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SubmittedAppointment {
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
  };
  billing: {
    amount: number;
    status: string;
    last_submitted: string | null;
  };
  claim_claimmd_id: string;
  insurance_paid_amount?: number;
  patient_responsibility_amount?: number;
}

interface SubmittedClaimsQueueProps {
  appointments: SubmittedAppointment[];
  isLoading: boolean;
  error: Error | null;
  selectedAppointmentId: string | null;
  onAppointmentSelect: (appointmentId: string) => void;
}

export default function SubmittedClaimsQueue({
  appointments,
  isLoading,
  error,
  selectedAppointmentId,
  onAppointmentSelect,
}: SubmittedClaimsQueueProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // DEBUGGING: Log the raw appointments data to understand what we're receiving
  console.log('SubmittedClaimsQueue received appointments:', appointments);
  console.log('Number of appointments:', appointments?.length || 0);

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
      case "payment received":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>;
      case "submitted to clearinghouse":
      case "submitted":
        return <Badge variant="secondary">Submitted</Badge>;
      case "rejected":
      case "denied":
        return <Badge variant="destructive">Rejected</Badge>;
      case "accepted":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Accepted</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  const filteredAppointments = appointments?.filter((appointment) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      appointment.client.name.toLowerCase().includes(query) ||
      appointment.provider.name.toLowerCase().includes(query) ||
      (appointment.service.cpt_code && appointment.service.cpt_code.toLowerCase().includes(query)) ||
      (appointment.claim_claimmd_id && appointment.claim_claimmd_id.toLowerCase().includes(query));
    
    const matchesStatus = statusFilter === "all" || 
      appointment.billing.status?.toLowerCase().includes(statusFilter.toLowerCase());
    
    return matchesSearch && matchesStatus;
  }) || [];

  // DEBUGGING: Log the filtered results
  console.log('Filtered appointments:', filteredAppointments);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedAppointments = filteredAppointments.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center rounded-md bg-destructive/10 border border-destructive/20">
        <h3 className="font-medium text-destructive">Failed to load submitted claims</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Input
            placeholder="Search by patient, provider, CPT code, or claim ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>CPT</TableHead>
              <TableHead>Claim ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`loading-${idx}`}>
                  <TableCell><Skeleton className="h-5 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[50px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[70px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : displayedAppointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <div className="space-y-2">
                    <div>
                      {filteredAppointments.length === 0 && searchQuery ? 
                        "No submitted claims match your search" : 
                        "No submitted claims found"
                      }
                    </div>
                    {/* DEBUGGING: Show raw data info */}
                    {!isLoading && appointments && (
                      <div className="text-xs text-muted-foreground">
                        Raw data: {appointments.length} total appointments received
                        {appointments.length > 0 && (
                          <div className="mt-1">
                            Sample: {JSON.stringify(appointments[0], null, 2).substring(0, 200)}...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              displayedAppointments.map((appointment) => (
                <TableRow 
                  key={appointment.id}
                  className={selectedAppointmentId === appointment.id ? "bg-muted" : undefined}
                >
                  <TableCell className="font-medium">{appointment.client.name}</TableCell>
                  <TableCell>{new Date(appointment.start_at).toLocaleDateString()}</TableCell>
                  <TableCell>{appointment.service.cpt_code || "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{appointment.claim_claimmd_id}</TableCell>
                  <TableCell>${appointment.billing.amount?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell>
                    {appointment.insurance_paid_amount ? 
                      `$${appointment.insurance_paid_amount.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(appointment.billing.status)}
                  </TableCell>
                  <TableCell>
                    {appointment.billing.last_submitted ? 
                      formatDistanceToNow(new Date(appointment.billing.last_submitted), { addSuffix: true }) : 
                      "—"}
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
        {filteredAppointments.length} submitted claim{filteredAppointments.length !== 1 ? 's' : ''} found
        {searchQuery && ` (filtered from ${appointments?.length || 0} total)`}
        {/* DEBUGGING: Show additional info */}
        {!isLoading && (
          <div className="mt-1 text-xs">
            Debug: Raw appointments={appointments?.length || 0}, Filtered={filteredAppointments.length}, Displayed={displayedAppointments.length}
          </div>
        )}
      </div>
    </div>
  );
}
