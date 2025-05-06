
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ActivityItem = {
  id: string;
  type: "claim" | "payment" | "verification";
  description: string;
  timestamp: string;
  status: "success" | "pending" | "error";
  amount?: string;
  patientName: string;
};

// Mock data - would come from your API
const activityData: ActivityItem[] = [
  {
    id: "act1",
    type: "claim",
    description: "Claim submitted for BlueCross",
    timestamp: "10 minutes ago",
    status: "success",
    amount: "$125.00",
    patientName: "John Smith",
  },
  {
    id: "act2",
    type: "payment",
    description: "Payment received from Aetna",
    timestamp: "1 hour ago",
    status: "success",
    amount: "$98.50",
    patientName: "Sarah Johnson",
  },
  {
    id: "act3",
    type: "verification",
    description: "Insurance verification completed",
    timestamp: "2 hours ago",
    status: "success",
    patientName: "Michael Brown",
  },
  {
    id: "act4",
    type: "claim",
    description: "Claim rejected - missing information",
    timestamp: "3 hours ago",
    status: "error",
    amount: "$210.75",
    patientName: "Emily Davis",
  },
  {
    id: "act5",
    type: "verification",
    description: "Insurance verification pending",
    timestamp: "4 hours ago",
    status: "pending",
    patientName: "Robert Wilson",
  },
];

export default function RecentActivity() {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800 hover:bg-green-100";
      case "pending":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
      case "error":
        return "bg-red-100 text-red-800 hover:bg-red-100";
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-100";
    }
  };

  const renderActivityList = (items: ActivityItem[]) => (
    <div className="space-y-4 mt-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-start p-3 rounded-lg border hover:bg-gray-50 transition-colors">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{item.patientName}</h4>
              <Badge className={getStatusColor(item.status)}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-gray-500">{item.timestamp}</span>
              {item.amount && <span className="text-xs font-medium">{item.amount}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest billing activity across the system</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="verification">Verification</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            {renderActivityList(activityData)}
          </TabsContent>
          <TabsContent value="claims">
            {renderActivityList(activityData.filter(item => item.type === "claim"))}
          </TabsContent>
          <TabsContent value="payments">
            {renderActivityList(activityData.filter(item => item.type === "payment"))}
          </TabsContent>
          <TabsContent value="verification">
            {renderActivityList(activityData.filter(item => item.type === "verification"))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
