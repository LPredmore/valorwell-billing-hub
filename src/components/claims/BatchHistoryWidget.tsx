import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';

interface BatchLog {
  id: string;
  batch_id: string;
  file_name: string;
  claims_count: number;
  successful_claims: number;
  failed_claims: number;
  status: string;
  created_at: string;
  upload_time: string;
}

export default function BatchHistoryWidget() {
  const [batchHistory, setBatchHistory] = useState<BatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchBatchHistory();
  }, []);

  const fetchBatchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('batch_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setBatchHistory(data || []);
    } catch (error) {
      console.error('Error fetching batch history:', error);
      toast({
        title: "Error",
        description: "Failed to fetch batch history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant = status.toLowerCase() === 'completed' ? 'default' : 
                   status.toLowerCase() === 'failed' ? 'destructive' : 'secondary';
    
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status}
      </Badge>
    );
  };

  const calculateSuccessRate = (successful: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((successful / total) * 100);
  };

  const downloadBatchFile = async (batchId: string, fileName: string) => {
    try {
      // In a real implementation, this would download the actual batch file
      toast({
        title: "Download Started",
        description: `Downloading ${fileName}...`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not download batch file",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Batch History</CardTitle>
          <CardDescription>Recent batch submission history</CardDescription>
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
        <CardTitle>Batch History</CardTitle>
        <CardDescription>Recent batch submission history and performance</CardDescription>
      </CardHeader>
      <CardContent>
        {batchHistory.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No batch history found
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Claims</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchHistory.map((batch) => {
                  const successRate = calculateSuccessRate(batch.successful_claims, batch.claims_count);
                  
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-sm">
                        {batch.batch_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{batch.claims_count} total</span>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span className="text-green-600">{batch.successful_claims} success</span>
                            <span className="text-red-600">{batch.failed_claims} failed</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Progress value={successRate} className="h-2" />
                          <span className="text-xs text-muted-foreground">{successRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(batch.status)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(batch.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadBatchFile(batch.batch_id, batch.file_name)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={fetchBatchHistory}
                className="w-full"
              >
                Refresh History
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}