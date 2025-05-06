
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Filter, FileText, CreditCard, FileCheck } from "lucide-react";

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

// Mock data - would come from your API/database
const patientsData: Patient[] = [
  {
    id: "PT-1001",
    name: "John Smith",
    dob: "04/15/1985",
    insurance: "Aetna",
    memberId: "AET12345678",
    status: "active",
    balanceDue: "$45.00",
    lastVisit: "2025-05-01",
    email: "john.smith@example.com",
  },
  {
    id: "PT-1002",
    name: "Sarah Johnson",
    dob: "09/23/1990",
    insurance: "BlueCross",
    memberId: "BCS87654321",
    status: "active",
    balanceDue: "$0.00",
    lastVisit: "2025-05-02",
    email: "sarah.j@example.com",
  },
  {
    id: "PT-1003",
    name: "Michael Brown",
    dob: "11/30/1976",
    insurance: "UnitedHealthcare",
    memberId: "UHC56781234",
    status: "inactive",
    balanceDue: "$125.50",
    lastVisit: "2025-04-15",
    email: "mbrown@example.com",
  },
  {
    id: "PT-1004",
    name: "Emily Davis",
    dob: "02/14/1988",
    insurance: "Cigna",
    memberId: "CIG43218765",
    status: "pending",
    balanceDue: "$0.00",
    lastVisit: "2025-04-30",
    email: "emilyd@example.com",
  },
  {
    id: "PT-1005",
    name: "Robert Wilson",
    dob: "07/19/1982",
    insurance: "Aetna",
    memberId: "AET98761234",
    status: "active",
    balanceDue: "$75.00",
    lastVisit: "2025-04-28",
    email: "rwilson@example.com",
  },
  {
    id: "PT-1006",
    name: "Jennifer Lopez",
    dob: "03/25/1979",
    insurance: "Humana",
    memberId: "HUM23456789",
    status: "active",
    balanceDue: "$0.00",
    lastVisit: "2025-05-03",
    email: "jlopez@example.com",
  },
  {
    id: "PT-1007",
    name: "David Martinez",
    dob: "08/05/1995",
    insurance: "Medicare",
    memberId: "MED87654321",
    status: "active",
    balanceDue: "$0.00",
    lastVisit: "2025-04-25",
    email: "dmartinez@example.com",
  },
];

export default function Patients() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPatients, setFilteredPatients] = useState(patientsData);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    
    const filtered = patientsData.filter(patient => 
      patient.name.toLowerCase().includes(query) || 
      patient.id.toLowerCase().includes(query) || 
      patient.insurance.toLowerCase().includes(query) ||
      patient.memberId.toLowerCase().includes(query)
    );
    
    setFilteredPatients(filtered);
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

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-3 px-4 text-left font-medium">Patient ID</th>
                  <th className="py-3 px-4 text-left font-medium">Name</th>
                  <th className="py-3 px-4 text-left font-medium">DOB</th>
                  <th className="py-3 px-4 text-left font-medium">Insurance</th>
                  <th className="py-3 px-4 text-left font-medium">Status</th>
                  <th className="py-3 px-4 text-left font-medium">Balance</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs">{patient.id}</span>
                    </td>
                    <td className="py-3 px-4 font-medium">{patient.name}</td>
                    <td className="py-3 px-4">{patient.dob}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span>{patient.insurance}</span>
                        <span className="text-xs text-muted-foreground">{patient.memberId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(patient.status)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={patient.balanceDue !== "$0.00" ? "font-medium text-red-600" : ""}>
                        {patient.balanceDue}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <FileCheck className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <FileText className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <CreditCard className="h-4 w-4 text-purple-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {filteredPatients.length} of {patientsData.length} patients
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
