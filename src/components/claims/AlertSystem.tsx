import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AlertRule {
  id: string;
  error_pattern: string;
  threshold_count: number;
  time_window_minutes: number;
  alert_enabled: boolean;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
  last_triggered_at?: string;
  created_at: string;
}

interface ErrorSummary {
  pattern: string;
  count: number;
  severity: string;
  last_occurrence: string;
}

export default function AlertSystem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRule, setNewRule] = useState({
    error_pattern: '',
    threshold_count: 5,
    time_window_minutes: 60,
    severity_level: 'medium' as const
  });

  // Fetch alert rules
  const { data: alertRules, isLoading: rulesLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_monitoring')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as AlertRule[];
    }
  });

  // Fetch error summary for the last 24 hours
  const { data: errorSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['error-summary'],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const { data, error } = await supabase
        .from('api_logs')
        .select('error_message, error_severity, created_at')
        .eq('status', 'error')
        .gte('created_at', twentyFourHoursAgo.toISOString());
      
      if (error) throw error;
      
      // Group errors by pattern
      const grouped = data.reduce((acc: Record<string, ErrorSummary>, log) => {
        const pattern = log.error_message?.substring(0, 50) || 'Unknown';
        if (!acc[pattern]) {
          acc[pattern] = {
            pattern,
            count: 0,
            severity: log.error_severity || 'medium',
            last_occurrence: log.created_at
          };
        }
        acc[pattern].count++;
        if (new Date(log.created_at) > new Date(acc[pattern].last_occurrence)) {
          acc[pattern].last_occurrence = log.created_at;
        }
        return acc;
      }, {});
      
      return Object.values(grouped).sort((a, b) => b.count - a.count);
    }
  });

  // Create alert rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (rule: typeof newRule) => {
      const { data, error } = await supabase
        .from('error_monitoring')
        .insert([{
          error_pattern: rule.error_pattern,
          threshold_count: rule.threshold_count,
          time_window_minutes: rule.time_window_minutes,
          severity_level: rule.severity_level,
          alert_enabled: true
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setNewRule({
        error_pattern: '',
        threshold_count: 5,
        time_window_minutes: 60,
        severity_level: 'medium'
      });
      toast({
        title: 'Alert Rule Created',
        description: 'New monitoring rule has been added successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create alert rule: ${error.message}`,
        variant: 'destructive',
      });
    }
  });

  // Toggle alert rule mutation
  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('error_monitoring')
        .update({ alert_enabled: enabled })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast({
        title: 'Alert Rule Updated',
        description: 'Rule status has been updated successfully.',
      });
    }
  });

  // Delete alert rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('error_monitoring')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast({
        title: 'Alert Rule Deleted',
        description: 'Rule has been removed successfully.',
      });
    }
  });

  // Check thresholds mutation
  const checkThresholdsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('check_error_thresholds');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-summary'] });
      toast({
        title: 'Threshold Check Complete',
        description: 'Alert thresholds have been evaluated.',
      });
    }
  });

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.error_pattern.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Error pattern is required.',
        variant: 'destructive',
      });
      return;
    }
    createRuleMutation.mutate(newRule);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'medium':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Error Summary (Last 24h)</CardTitle>
            <CardDescription>
              Most frequent errors and their patterns
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkThresholdsMutation.mutate()}
            disabled={checkThresholdsMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checkThresholdsMutation.isPending ? 'animate-spin' : ''}`} />
            Check Thresholds
          </Button>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="text-center py-4">Loading error summary...</div>
          ) : !errorSummary?.length ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                No errors detected in the last 24 hours. System is running smoothly!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {errorSummary.slice(0, 10).map((error, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getSeverityIcon(error.severity)}
                    <div>
                      <p className="font-medium text-sm">{error.pattern}...</p>
                      <p className="text-xs text-muted-foreground">
                        Last seen: {formatTimeAgo(error.last_occurrence)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getSeverityColor(error.severity) as any}>
                      {error.count} occurrences
                    </Badge>
                    <Badge variant="outline">{error.severity}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create New Alert Rule */}
      <Card>
        <CardHeader>
          <CardTitle>Create Alert Rule</CardTitle>
          <CardDescription>
            Set up monitoring rules to get notified when error thresholds are exceeded
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Error Pattern</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="e.g., 'timeout', 'authentication', etc."
                  value={newRule.error_pattern}
                  onChange={(e) => setNewRule(prev => ({ ...prev, error_pattern: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Threshold Count</label>
                <input
                  type="number"
                  min="1"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={newRule.threshold_count}
                  onChange={(e) => setNewRule(prev => ({ ...prev, threshold_count: parseInt(e.target.value) }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Time Window (minutes)</label>
                <input
                  type="number"
                  min="1"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={newRule.time_window_minutes}
                  onChange={(e) => setNewRule(prev => ({ ...prev, time_window_minutes: parseInt(e.target.value) }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Severity Level</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={newRule.severity_level}
                  onChange={(e) => setNewRule(prev => ({ ...prev, severity_level: e.target.value as any }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <Button type="submit" disabled={createRuleMutation.isPending}>
              {createRuleMutation.isPending ? 'Creating...' : 'Create Alert Rule'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing Alert Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Rules</CardTitle>
          <CardDescription>
            Manage your existing monitoring rules
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <div className="text-center py-4">Loading alert rules...</div>
          ) : !alertRules?.length ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No alert rules configured. Create your first rule above to start monitoring.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {alertRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getSeverityIcon(rule.severity_level)}
                    <div>
                      <p className="font-medium">Pattern: "{rule.error_pattern}"</p>
                      <p className="text-sm text-muted-foreground">
                        {rule.threshold_count} errors in {rule.time_window_minutes} minutes
                        {rule.last_triggered_at && (
                          <span> • Last triggered: {formatTimeAgo(rule.last_triggered_at)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getSeverityColor(rule.severity_level) as any}>
                      {rule.severity_level}
                    </Badge>
                    <Badge variant={rule.alert_enabled ? 'default' : 'secondary'}>
                      {rule.alert_enabled ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleRuleMutation.mutate({
                        id: rule.id,
                        enabled: !rule.alert_enabled
                      })}
                      disabled={toggleRuleMutation.isPending}
                    >
                      {rule.alert_enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      disabled={deleteRuleMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
