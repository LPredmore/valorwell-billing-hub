import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Clock, Target } from 'lucide-react';

interface PerformanceMetric {
  id: string;
  batch_date: string;
  total_claims: number;
  successful_claims: number;
  failed_claims: number;
  processing_time_minutes: number;
  average_response_time_ms: number;
  error_rate_percent: number;
}

export default function BatchPerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [summary, setSummary] = useState({
    totalClaims: 0,
    successRate: 0,
    avgProcessingTime: 0,
    avgErrorRate: 0,
    trend: 'stable' as 'up' | 'down' | 'stable'
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      // Get last 30 days of metrics
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('batch_performance_metrics')
        .select('*')
        .gte('batch_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('batch_date', { ascending: false });

      if (error) throw error;

      setMetrics(data || []);
      calculateSummary(data || []);
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      toast({
        title: "Error",
        description: "Failed to fetch performance metrics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (data: PerformanceMetric[]) => {
    if (data.length === 0) {
      setSummary({
        totalClaims: 0,
        successRate: 0,
        avgProcessingTime: 0,
        avgErrorRate: 0,
        trend: 'stable'
      });
      return;
    }

    const totalClaims = data.reduce((sum, m) => sum + m.total_claims, 0);
    const totalSuccessful = data.reduce((sum, m) => sum + m.successful_claims, 0);
    const avgProcessingTime = data.reduce((sum, m) => sum + m.processing_time_minutes, 0) / data.length;
    const avgErrorRate = data.reduce((sum, m) => sum + m.error_rate_percent, 0) / data.length;
    
    // Calculate trend based on last week vs previous week
    const lastWeekMetrics = data.slice(0, 7);
    const prevWeekMetrics = data.slice(7, 14);
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (lastWeekMetrics.length > 0 && prevWeekMetrics.length > 0) {
      const lastWeekSuccessRate = lastWeekMetrics.reduce((sum, m) => 
        sum + (m.total_claims > 0 ? (m.successful_claims / m.total_claims) * 100 : 0), 0
      ) / lastWeekMetrics.length;
      
      const prevWeekSuccessRate = prevWeekMetrics.reduce((sum, m) => 
        sum + (m.total_claims > 0 ? (m.successful_claims / m.total_claims) * 100 : 0), 0
      ) / prevWeekMetrics.length;
      
      if (lastWeekSuccessRate > prevWeekSuccessRate + 2) trend = 'up';
      else if (lastWeekSuccessRate < prevWeekSuccessRate - 2) trend = 'down';
    }

    setSummary({
      totalClaims,
      successRate: totalClaims > 0 ? (totalSuccessful / totalClaims) * 100 : 0,
      avgProcessingTime,
      avgErrorRate,
      trend
    });
  };

  const getTrendIcon = () => {
    switch (summary.trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Target className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>Batch processing performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Performance Metrics
          {getTrendIcon()}
        </CardTitle>
        <CardDescription>
          Batch processing performance over the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Success Rate</span>
              <span className="text-sm text-muted-foreground">
                {summary.successRate.toFixed(1)}%
              </span>
            </div>
            <Progress value={summary.successRate} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Error Rate</span>
              <span className="text-sm text-muted-foreground">
                {summary.avgErrorRate.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={summary.avgErrorRate} 
              className="h-2" 
              // You might want to use a different color for error rate
            />
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Avg Processing Time</p>
              <p className="text-lg font-bold">{formatTime(summary.avgProcessingTime)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Total Claims Processed</p>
              <p className="text-lg font-bold">{summary.totalClaims.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {metrics.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-medium mb-3">Recent Performance</h4>
            <div className="space-y-2">
              {metrics.slice(0, 5).map((metric) => (
                <div key={metric.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(metric.batch_date).toLocaleDateString()}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      {metric.total_claims} claims
                    </span>
                    <span className={
                      metric.error_rate_percent <= 5 ? 'text-green-600' :
                      metric.error_rate_percent <= 15 ? 'text-yellow-600' : 'text-red-600'
                    }>
                      {metric.error_rate_percent.toFixed(1)}% errors
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}