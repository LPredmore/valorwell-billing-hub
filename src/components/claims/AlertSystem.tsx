import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle, Info, XCircle, Bell, BellOff } from 'lucide-react';

interface AlertItem {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  resolved: boolean;
}

export default function AlertSystem() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAlerts();
    checkNotificationPermission();
  }, []);

  const fetchAlerts = async () => {
    try {
      // Fetch from API logs for error-related alerts
      const { data: apiLogs, error } = await supabase
        .from('api_logs')
        .select('*')
        .in('status', ['error', 'alert'])
        .eq('resolution_status', 'new')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const formattedAlerts: AlertItem[] = (apiLogs || []).map(log => ({
        id: log.id,
        type: log.status === 'error' ? 'error' : 'warning',
        title: getAlertTitle(log.endpoint, log.error_category),
        message: log.error_message || 'Unknown error occurred',
        timestamp: log.created_at,
        severity: mapSeverity(log.error_severity),
        source: log.endpoint,
        resolved: log.resolution_status === 'resolved'
      }));

      setAlerts(formattedAlerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast({
        title: "Error",
        description: "Failed to fetch alerts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      
      if (permission === 'granted') {
        toast({
          title: "Notifications Enabled",
          description: "You will now receive alerts for critical issues",
        });
      }
    }
  };

  const getAlertTitle = (endpoint: string, category: string) => {
    const titles: { [key: string]: string } = {
      'batch-automation': 'Batch Processing Alert',
      'claim-batch-submission': 'Batch Submission Alert',
      'insurance-eligibility': 'Insurance Verification Alert',
      'era-retrieval': 'ERA Processing Alert',
    };
    
    return titles[endpoint] || `${category} Alert`;
  };

  const mapSeverity = (severity: string): 'low' | 'medium' | 'high' | 'critical' => {
    const mapping: { [key: string]: 'low' | 'medium' | 'high' | 'critical' } = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'critical': 'critical'
    };
    return mapping[severity] || 'medium';
  };

  const getAlertIcon = (type: string, severity: string) => {
    if (severity === 'critical') return <XCircle className="h-4 w-4 text-red-500" />;
    
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants = {
      low: 'secondary',
      medium: 'outline', 
      high: 'destructive',
      critical: 'destructive'
    } as const;

    return (
      <Badge 
        variant={variants[severity as keyof typeof variants] || 'secondary'}
        className={severity === 'critical' ? 'animate-pulse' : ''}
      >
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('api_logs')
        .update({ 
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts(alerts.filter(alert => alert.id !== alertId));
      
      toast({
        title: "Alert Resolved",
        description: "Alert has been marked as resolved",
      });
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast({
        title: "Error",
        description: "Failed to resolve alert",
        variant: "destructive",
      });
    }
  };

  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
  const highAlerts = alerts.filter(alert => alert.severity === 'high');
  const otherAlerts = alerts.filter(alert => !['critical', 'high'].includes(alert.severity));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Alerts</CardTitle>
          <CardDescription>Monitor system health and issues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              System Alerts
              {alerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {alerts.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Monitor system health and critical issues</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={notificationsEnabled ? undefined : requestNotificationPermission}
            className="flex items-center gap-2"
          >
            {notificationsEnabled ? (
              <>
                <Bell className="h-4 w-4" />
                Notifications On
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4" />
                Enable Notifications
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium">All systems operational</p>
            <p className="text-sm">No active alerts or issues detected</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-red-600">Critical Alerts</h4>
                {criticalAlerts.map((alert) => (
                  <Alert key={alert.id} variant="destructive" className="animate-pulse">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {getAlertIcon(alert.type, alert.severity)}
                        <div className="flex-1">
                          <AlertTitle className="flex items-center gap-2">
                            {alert.title}
                            {getSeverityBadge(alert.severity)}
                          </AlertTitle>
                          <AlertDescription className="mt-1">
                            {alert.message}
                          </AlertDescription>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(alert.timestamp).toLocaleString()} | {alert.source}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </Alert>
                ))}
              </div>
            ))}

            {/* High Priority Alerts */}
            {highAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-orange-600">High Priority</h4>
                {highAlerts.map((alert) => (
                  <Alert key={alert.id} className="border-orange-200">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {getAlertIcon(alert.type, alert.severity)}
                        <div className="flex-1">
                          <AlertTitle className="flex items-center gap-2">
                            {alert.title}
                            {getSeverityBadge(alert.severity)}
                          </AlertTitle>
                          <AlertDescription className="mt-1">
                            {alert.message}
                          </AlertDescription>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(alert.timestamp).toLocaleString()} | {alert.source}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </Alert>
                ))}
              </div>
            ))}

            {/* Other Alerts */}
            {otherAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Other Alerts</h4>
                {otherAlerts.map((alert) => (
                  <Alert key={alert.id}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {getAlertIcon(alert.type, alert.severity)}
                        <div className="flex-1">
                          <AlertTitle className="flex items-center gap-2">
                            {alert.title}
                            {getSeverityBadge(alert.severity)}
                          </AlertTitle>
                          <AlertDescription className="mt-1">
                            {alert.message}
                          </AlertDescription>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(alert.timestamp).toLocaleString()} | {alert.source}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </Alert>
                ))}
              </div>
            ))}

            <div className="pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={fetchAlerts}
                className="w-full"
              >
                Refresh Alerts
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
