import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ErrorMonitoringDashboard from '@/components/monitoring/ErrorMonitoringDashboard';
import ErrorRecoveryService from '@/components/monitoring/ErrorRecoveryService';

const ErrorMonitoring = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Error Monitoring & Recovery</h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive error tracking, monitoring, and automated recovery for insurance verification
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dashboard">Monitoring Dashboard</TabsTrigger>
          <TabsTrigger value="recovery">Recovery Service</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <ErrorMonitoringDashboard />
        </TabsContent>

        <TabsContent value="recovery" className="space-y-4">
          <ErrorRecoveryService />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ErrorMonitoring;