
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock data - would come from your API/database
const claimsData = [
  { month: 'Jan', submitted: 65, paid: 42, denied: 12 },
  { month: 'Feb', submitted: 59, paid: 40, denied: 10 },
  { month: 'Mar', submitted: 80, paid: 57, denied: 15 },
  { month: 'Apr', submitted: 81, paid: 60, denied: 11 },
  { month: 'May', submitted: 56, paid: 45, denied: 8 }
];

const revenueData = [
  { month: 'Jan', billed: 15400, collected: 12800 },
  { month: 'Feb', billed: 14200, collected: 11900 },
  { month: 'Mar', billed: 19300, collected: 16200 },
  { month: 'Apr', billed: 19800, collected: 17300 },
  { month: 'May', billed: 13500, collected: 11800 }
];

export default function ClaimsActivity() {
  return (
    <Card className="h-[450px]">
      <CardHeader>
        <CardTitle>Billing Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="claims">
          <TabsList>
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>
          
          <TabsContent value="claims" className="pt-4">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={claimsData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="submitted" name="Submitted" fill="#9b87f5" />
                <Bar dataKey="paid" name="Paid" fill="#7E69AB" />
                <Bar dataKey="denied" name="Denied" fill="#E77982" />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>
          
          <TabsContent value="revenue" className="pt-4">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart 
                data={revenueData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value) => [`$${value.toLocaleString()}`, undefined]} 
                />
                <Line 
                  type="monotone" 
                  dataKey="billed" 
                  name="Billed" 
                  stroke="#9b87f5" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="collected" 
                  name="Collected" 
                  stroke="#7E69AB" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
