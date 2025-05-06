
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Filter, FileText, CreditCard, FileCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Patient = {
  id: string;
  name: string;
  dob: string;
  insurance: string;
  memberId: string;
  status: "active" | "inactive" | "pending";
  balanceDue: string;
  lastVisit: string;
  email: string;
};

export default function Patients() {
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 10;

  // Fetch clients data from Supabase
  useEffect(() => {
    async function fetchClients() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*');

        if (error) {
          throw new Error(error.message);
        }

        if (data) {
          // Transform the client data to match our Patient type
          const transformedData: Patient[] = data.map(client => ({
            id: client.id || `PT-${Math.floor(Math.random() * 10000)}`,
            name: `${client.client_first_name || ''} ${client.client_last_name || ''}`.trim() || 'Unknown',
            dob: client.client_date_of_birth ? formatDate(client.client_date_of_birth) : 'N/A',
            insurance: client.client_insurance_company_primary || 'N/A',
            memberId: client.client_policy_number_primary || 'N/A',
            status: mapClientStatus(client.client_status),
            balanceDue: '$0.00', // Placeholder until we have financial data
            lastVisit: 'N/A', // Placeholder until we have appointment data
            email: client.client_email || 'N/A',
          }));

          setPatients(transformedData);
          setFilteredPatients(transformedData);
        }
      } catch (err) {
        console.error("Error fetching clients:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchClients();
  }, []);

  // Helper function to format date from ISO to MM/DD/YYYY
  const formatDate = (isoDate: string) => {
    if (!isoDate) return 'N/A';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric' 
    });
  };

  // Helper function to map client status to our Patient status type
  const mapClientStatus = (status?: string): "active" | "inactive" | "pending" => {
    if (!status) return "pending";
    const lowerStatus = status.toLowerCase();
    
    if (lowerStatus === "active" || lowerStatus === "waiting") return "active";
    if (lowerStatus === "inactive") return "inactive";
    return "pending";
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    
    const filtered = patients.filter(patient => 
      patient.name.toLowerCase().includes(query) || 
      patient.id.toLowerCase().includes(query) || 
      patient.insurance.toLowerCase().includes(query) ||
      patient.memberId.toLowerCase().includes(query) ||
      patient.email.toLowerCase().includes(query)
    );
    
    setFilteredPatients(filtered);
    setCurrentPage(1); // Reset to first page on new search
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case "inactive":
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inactive</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  // Pagination logic
  const indexOfLastPatient = currentPage * patientsPerPage;
  const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
  const currentPatients = filteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);
  const totalPages = Math.ceil(filteredPatients.length / patientsPerPage);

  const paginate = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Users size={24} />
            Patients
          </h1>
          <p className="text-muted-foreground">Manage patient billing information</p>
        </div>
        <Button className="bg-valorwell-purple hover:bg-valorwell-purple-dark">
          New Patient
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Patient Directory</CardTitle>
          <CardDescription>View and manage patient billing profiles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patients..."
                className="pl-8"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {error ? (
            <div className="text-center p-6 text-red-500">
              <p>Error loading patients: {error}</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading skeletons
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        {Array.from({ length: 7 }).map((_, cellIndex) => (
                          <TableCell key={`cell-${index}-${cellIndex}`}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : currentPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6">
                        No patients found. Try adjusting your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    currentPatients.map((patient) => (
                      <TableRow key={patient.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <span className="font-mono text-xs">{patient.id}</span>
                        </TableCell>
                        <TableCell className="font-medium">{patient.name}</TableCell>
                        <TableCell>{patient.dob}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{patient.insurance}</span>
                            <span className="text-xs text-muted-foreground">{patient.memberId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(patient.status)}
                        </TableCell>
                        <TableCell>
                          <span className={patient.balanceDue !== "$0.00" ? "font-medium text-red-600" : ""}>
                            {patient.balanceDue}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Verify Insurance">
                              <FileCheck className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Notes">
                              <FileText className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Process Payment">
                              <CreditCard className="h-4 w-4 text-purple-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {currentPatients.length} of {filteredPatients.length} patients
          </div>
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => paginate(currentPage - 1)} 
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {Array.from({ length: Math.min(5, totalPages) }).map((_, index) => {
                  // Logic to show pages around current page
                  let pageToShow: number;
                  if (totalPages <= 5) {
                    pageToShow = index + 1;
                  } else if (currentPage <= 3) {
                    pageToShow = index + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageToShow = totalPages - 4 + index;
                  } else {
                    pageToShow = currentPage - 2 + index;
                  }
                  
                  return (
                    <PaginationItem key={`page-${pageToShow}`}>
                      <PaginationLink 
                        isActive={currentPage === pageToShow}
                        onClick={() => paginate(pageToShow)}
                      >
                        {pageToShow}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => paginate(currentPage + 1)}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
