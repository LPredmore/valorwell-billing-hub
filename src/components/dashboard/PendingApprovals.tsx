
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertCircle } from "lucide-react";

type PendingItem = {
  id: string;
  patientName: string;
  service: string;
  amount: string;
  payer: string;
  status: "needs-review" | "pending-info" | "ready-submit";
  date: string;
};

// Mock data - would come from your API/database
const pendingItems: PendingItem[] = [
  {
    id: "p1",
    patientName: "Thomas Wilson",
    service: "Therapy - Individual",
    amount: "$120.00",
    payer: "UnitedHealthcare",
    status: "needs-review",
    date: "2025-05-04",
  },
  {
    id: "p2",
    patientName: "Lisa Johnson",
    service: "Psychological Evaluation",
    amount: "$275.50",
    payer: "Cigna",
    status: "pending-info",
    date: "2025-05-03",
  },
  {
    id: "p3",
    patientName: "David Martinez",
    service: "Therapy - Group",
    amount: "$85.00",
    payer: "Aetna",
    status: "ready-submit",
    date: "2025-05-04",
  },
  {
    id: "p4",
    patientName: "Jennifer Lopez",
    service: "Therapy - Individual",
    amount: "$120.00",
    payer: "Humana",
    status: "needs-review",
    date: "2025-05-03",
  },
];

export default function PendingApprovals() {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "needs-review":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Needs Review</Badge>;
      case "pending-info":
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Pending Info</Badge>;
      case "ready-submit":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Ready to Submit</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Pending Approvals</CardTitle>
            <CardDescription>Claims requiring attention before submission</CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{pendingItems.length} pending</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <table className="w-full">
          <thead>
            <tr className="border-b text-sm text-muted-foreground">
              <th className="px-6 py-2 text-left font-medium">Patient</th>
              <th className="px-6 py-2 text-left font-medium">Service</th>
              <th className="px-6 py-2 text-left font-medium">Amount</th>
              <th className="px-6 py-2 text-left font-medium">Payer</th>
              <th className="px-6 py-2 text-left font-medium">Status</th>
              <th className="px-6 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {pendingItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm">{item.patientName}</td>
                <td className="px-6 py-3 text-sm">{item.service}</td>
                <td className="px-6 py-3 text-sm">{item.amount}</td>
                <td className="px-6 py-3 text-sm">{item.payer}</td>
                <td className="px-6 py-3 text-sm">{getStatusBadge(item.status)}</td>
                <td className="px-6 py-3 text-sm text-right">
                  <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <CardFooter className="flex justify-between border-t pt-4">
        <Button variant="outline" size="sm">View All ({pendingItems.length})</Button>
        <Button size="sm" className="bg-valorwell-purple hover:bg-valorwell-purple-dark">
          <ClipboardCheck className="h-4 w-4 mr-2" />
          Process Selected
        </Button>
      </CardFooter>
    </Card>
  );
}
