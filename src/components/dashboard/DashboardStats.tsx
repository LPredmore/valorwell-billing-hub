
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, FileText, ClipboardCheck, AlertCircle } from "lucide-react";

export default function DashboardStats() {
  // This would typically come from your API/database
  const stats = [
    {
      title: "Total Claims Value",
      value: "$24,320.50",
      change: "+12%",
      trend: "up",
      icon: DollarSign,
      description: "vs. last month",
    },
    {
      title: "Claims Submitted",
      value: "342",
      change: "+8%",
      trend: "up",
      icon: FileText,
      description: "vs. last month",
    },
    {
      title: "Claims Paid",
      value: "287",
      change: "+5%",
      trend: "up",
      icon: ClipboardCheck,
      description: "vs. last month",
    },
    {
      title: "Pending Issues",
      value: "24",
      change: "-10%",
      trend: "down",
      icon: AlertCircle,
      description: "vs. last month",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="flex items-center text-xs mt-1">
              {stat.trend === "up" ? (
                <ArrowUpIcon className="h-3 w-3 text-green-500 mr-1" />
              ) : (
                <ArrowDownIcon className="h-3 w-3 text-red-500 mr-1" />
              )}
              <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
                {stat.change}
              </span>
              <span className="text-muted-foreground ml-1">{stat.description}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
