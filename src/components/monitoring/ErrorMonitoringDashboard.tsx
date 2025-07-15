import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ErrorLoggingService } from '@/services/errorLoggingService';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface ErrorLog {
  id: string;
  endpoint: string;
  status: string;
  error_message: string;
  error_category: string;
  error_severity: string;
  resolution_status: string;
  created_at: string;
  response_time_ms: number;
  retry_count: number;
}

const ErrorMonitoringDashboard = () => {
  // Fetch error statistics
  const { data: errorStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['error-statistics'],
    queryFn: () => ErrorLoggingService.getErrorStatistics(24),
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch recent errors
  const { data: recentErrors, isLoading: isLoadingErrors } = useQuery({
    queryKey: ['recent-errors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_logs')
        .select('id, endpoint, status, error_message, error_category, error_severity, resolution_status, created_at, response_time_ms, retry_count')
        .eq('status', 'error')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as ErrorLog[];
    },
    refetchInterval: 30000,
  });

  // Fetch system health metrics
  const { data: healthMetrics, isLoading: isLoadingHealth } = useQuery({
    queryKey: ['health-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_health_metrics')
        .select('metric_name, metric_value, metric_type, recorded_at')
        .gte('recorded_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('recorded_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityTextColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'new': return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'in_progress': return <Activity className="h-4 w-4 text-blue-600" />;
      case 'escalated': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      default: return <XCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoadingStats || isLoadingErrors || isLoadingHealth) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-300 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Errors (24h)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {errorStats?.totalErrors || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {errorStats?.errorRate ? `${errorStats.errorRate.toFixed(1)}%` : '0%'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {errorStats?.averageResponseTime ? `${Math.round(errorStats.averageResponseTime)}ms` : '0ms'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {(errorStats?.errorRate || 0) < 10 ? 'Healthy' : 'Degraded'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {errorStats && errorStats.errorRate > 20 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Critical Alert: Error rate is {errorStats.errorRate.toFixed(1)}% - significantly above normal thresholds.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="errors" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="errors">Recent Errors</TabsTrigger>
          <TabsTrigger value="categories">Error Categories</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
              <CardDescription>Latest 20 errors from the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentErrors?.map((error) => (
                  <div key={error.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(error.resolution_status)}
                      <div>
                        <p className="font-medium">{error.endpoint}</p>
                        <p className="text-sm text-muted-foreground">
                          {error.error_message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(error.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={error.error_severity === 'critical' ? 'destructive' : 'secondary'}>
                        {error.error_severity}
                      </Badge>
                      <Badge variant="outline">
                        {error.error_category}
                      </Badge>
                      {error.retry_count > 0 && (
                        <Badge variant="outline">
                          {error.retry_count} retries
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {(!recentErrors || recentErrors.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    No recent errors found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Error Categories</CardTitle>
              <CardDescription>Distribution of errors by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(errorStats?.errorsByCategory || {}).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="capitalize">{category.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">{count}</span>
                      <div className="w-20">
                        <Progress 
                          value={(count / (errorStats?.totalErrors || 1)) * 100} 
                          className="h-2"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error Severity</CardTitle>
              <CardDescription>Distribution of errors by severity level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(errorStats?.errorsBySeverity || {}).map(([severity, count]) => (
                  <div key={severity} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${getSeverityColor(severity)}`}></div>
                      <span className={`capitalize ${getSeverityTextColor(severity)}`}>
                        {severity}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">{count}</span>
                      <div className="w-20">
                        <Progress 
                          value={(count / (errorStats?.totalErrors || 1)) * 100} 
                          className="h-2"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Performance Trends</CardTitle>
              <CardDescription>24-hour performance overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Error Rate Trend</h4>
                    <div className="text-2xl font-bold text-red-600">
                      {errorStats?.errorRate ? `${errorStats.errorRate.toFixed(1)}%` : '0%'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(errorStats?.errorRate || 0) < 5 ? 'Normal' : 
                       (errorStats?.errorRate || 0) < 15 ? 'Elevated' : 'Critical'}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Response Time Trend</h4>
                    <div className="text-2xl font-bold text-blue-600">
                      {errorStats?.averageResponseTime ? `${Math.round(errorStats.averageResponseTime)}ms` : '0ms'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(errorStats?.averageResponseTime || 0) < 2000 ? 'Good' : 
                       (errorStats?.averageResponseTime || 0) < 5000 ? 'Slow' : 'Very Slow'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ErrorMonitoringDashboard;