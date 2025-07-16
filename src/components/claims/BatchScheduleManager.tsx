import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Clock, Play, Pause, Settings, AlertTriangle } from 'lucide-react';

interface BatchSchedule {
  id: string;
  schedule_name: string;
  cron_expression: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}

export default function BatchScheduleManager() {
  const [schedules, setSchedules] = useState<BatchSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('automated_batch_schedules')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast({
        title: "Error",
        description: "Failed to fetch batch schedules",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSchedule = async (scheduleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('automated_batch_schedules')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', scheduleId);

      if (error) throw error;

      setSchedules(schedules.map(schedule => 
        schedule.id === scheduleId 
          ? { ...schedule, is_active: isActive }
          : schedule
      ));

      toast({
        title: "Schedule Updated",
        description: `Schedule ${isActive ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      console.error('Error toggling schedule:', error);
      toast({
        title: "Error",
        description: "Failed to update schedule",
        variant: "destructive",
      });
    }
  };

  const runScheduleNow = async (scheduleId: string, scheduleName: string) => {
    try {
      // Determine operation based on schedule name
      let operation = 'daily_submission';
      if (scheduleName.includes('status_poll')) operation = 'status_poll';
      else if (scheduleName.includes('cleanup')) operation = 'cleanup';

      const { data, error } = await supabase.functions.invoke('batch-automation', {
        body: {
          operation,
          force: true
        }
      });

      if (error) throw error;

      toast({
        title: "Schedule Executed",
        description: `${scheduleName} executed successfully`,
      });

      // Refresh schedules to get updated run count
      fetchSchedules();
    } catch (error) {
      console.error('Error running schedule:', error);
      toast({
        title: "Execution Failed",
        description: "Failed to execute schedule manually",
        variant: "destructive",
      });
    }
  };

  const formatCronExpression = (cron: string) => {
    const expressions: { [key: string]: string } = {
      '0 2 * * *': 'Daily at 2:00 AM',
      '0 * * * *': 'Every hour',
      '0 3 * * 0': 'Weekly on Sunday at 3:00 AM',
    };
    return expressions[cron] || cron;
  };

  const getScheduleStatus = (schedule: BatchSchedule) => {
    if (!schedule.is_active) {
      return <Badge variant="secondary">Disabled</Badge>;
    }
    
    if (!schedule.last_run_at) {
      return <Badge variant="outline">Never Run</Badge>;
    }

    const lastRun = new Date(schedule.last_run_at);
    const now = new Date();
    const hoursSinceRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

    // Check if it's overdue based on schedule type
    let isOverdue = false;
    if (schedule.schedule_name.includes('hourly') && hoursSinceRun > 2) isOverdue = true;
    else if (schedule.schedule_name.includes('daily') && hoursSinceRun > 25) isOverdue = true;
    else if (schedule.schedule_name.includes('weekly') && hoursSinceRun > 168 + 1) isOverdue = true;

    if (isOverdue) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Overdue
        </Badge>
      );
    }

    return <Badge variant="default">Active</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Batch Schedule Manager</CardTitle>
          <CardDescription>Manage automated batch processing schedules</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
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
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Batch Schedule Manager
        </CardTitle>
        <CardDescription>
          Manage automated batch processing schedules and monitor their execution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schedule Name</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Run Count</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {schedule.schedule_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {schedule.cron_expression}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatCronExpression(schedule.cron_expression)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {getScheduleStatus(schedule)}
                </TableCell>
                <TableCell className="text-sm">
                  {schedule.last_run_at 
                    ? new Date(schedule.last_run_at).toLocaleString()
                    : 'Never'
                  }
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{schedule.run_count}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={(checked) => toggleSchedule(schedule.id, checked)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runScheduleNow(schedule.id, schedule.schedule_name)}
                      disabled={!schedule.is_active}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-6 pt-6 border-t space-y-4">
          <h4 className="text-sm font-medium">Schedule Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Daily Batch Submission</p>
              <p className="text-muted-foreground">
                Processes all pending claims automatically each day at 2:00 AM
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Hourly Status Poll</p>
              <p className="text-muted-foreground">
                Checks for claim status updates from Claim.MD every hour
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Weekly Cleanup</p>
              <p className="text-muted-foreground">
                Archives old logs and performs maintenance every Sunday
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}