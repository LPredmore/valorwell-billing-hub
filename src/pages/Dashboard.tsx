
import DashboardStats from "@/components/dashboard/DashboardStats";
import RecentActivity from "@/components/dashboard/RecentActivity";
import PendingApprovals from "@/components/dashboard/PendingApprovals";
import ClaimsActivity from "@/components/dashboard/ClaimsActivity";

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">Welcome to ValorWell Billing Hub</h1>
          <p className="text-muted-foreground">Here's your billing activity overview for today</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </div>
      </div>
      
      <DashboardStats />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClaimsActivity />
        <RecentActivity />
      </div>
      
      <PendingApprovals />
    </div>
  );
}
