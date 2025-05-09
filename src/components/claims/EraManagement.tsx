import React, { useState, useEffect } from "react";
import { useEraList, useEraRetrieval, useUnreconciledPayments, useReconcilePayment, useApiLogs } from "@/hooks/useClaimsData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCcw, AlertCircle, CheckCircle, FileText, DollarSign, Bug, Code } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function EraManagement() {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [selectedDebugLog, setSelectedDebugLog] = useState<any>(null);
  const { data: eraList = [], isLoading: isLoadingEraList, error: eraListError } = useEraList();
  const { data: unreconciledPayments = [], isLoading: isLoadingUnreconciled, error: unreconciledError } = useUnreconciledPayments();
  const { mutate: retrieveEra, isPending: isRetrieving, error: retrieveError } = useEraRetrieval();
  const { mutate: reconcilePayment, isPending: isReconciling } = useReconcilePayment();
  const { data: apiLogs = [], isLoading: isLoadingLogs, refetch: refetchLogs } = useApiLogs();
  const { toast } = useToast();
  
  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  // Format date
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Fetch logs when debug mode is shown
  useEffect(() => {
    if (showDebugLogs) {
      refetchLogs();
    }
  }, [showDebugLogs, refetchLogs]);

  // Enhanced error handling for retrieveEra
  const handleRetrieveEra = () => {
    retrieveEra(undefined, {
      onSuccess: (data) => {
        toast({
          title: "ERA Files Retrieved",
          description: `Successfully processed ${data.processedCount || 0} ERA files with ${data.paymentCount || 0} payments`,
          variant: "default",
        });
        
        // Automatically open debug logs after retrieval
        setShowDebugLogs(true);
        refetchLogs();
      },
      onError: (error) => {
        console.error("ERA retrieval error:", error);
        let errorMessage = "An error occurred";
        
        if (error instanceof Error) {
          // Extract more meaningful error messages
          errorMessage = error.message;
          
          // Look for specific API error patterns
          if (error.message.includes("AccountKey")) {
            errorMessage = "API Authentication Error: Verify your API key configuration.";
          } else if (error.message.includes("endpoint") || error.message.includes("format")) {
            errorMessage = "API Endpoint Error: The ERA endpoint format may be incorrect.";
          } else if (error.message.includes("No new ERA files")) {
            errorMessage = "No new ERA files available for processing.";
          } else if (error.message.includes("404") || error.message.includes("not found")) {
            errorMessage = "API Error: The requested ERA endpoint could not be found.";
          }
        }
        
        toast({
          title: "Failed to retrieve ERA files",
          description: errorMessage,
          variant: "destructive",
        });
        
        // Automatically open debug logs after error
        setShowDebugLogs(true);
        refetchLogs();
      }
    });
  };
  
  const selectedPayment = unreconciledPayments.find(payment => payment.id === selectedPaymentId);
  
  const form = useForm({
    defaultValues: {
      insurance_paid_amount: selectedPayment?.insurance_paid_amount || 0,
      patient_responsibility_amount: selectedPayment?.patient_responsibility_amount || 0,
      patient_payment_status: selectedPayment?.patient_payment_status || 'pending',
      patient_paid_amount: selectedPayment?.patient_paid_amount || 0,
      billing_notes: selectedPayment?.billing_notes || '',
    },
  });
  
  // Update form when selected payment changes
  useEffect(() => {
    if (selectedPayment) {
      form.reset({
        insurance_paid_amount: selectedPayment.insurance_paid_amount || 0,
        patient_responsibility_amount: selectedPayment.patient_responsibility_amount || 0,
        patient_payment_status: selectedPayment.patient_payment_status || 'pending',
        patient_paid_amount: selectedPayment.patient_paid_amount || 0,
        billing_notes: selectedPayment.billing_notes || '',
      });
    }
  }, [selectedPayment, form]);
  
  const onSubmit = (data: any) => {
    if (selectedPaymentId) {
      reconcilePayment({
        appointmentId: selectedPaymentId,
        paymentData: {
          ...data,
          insurance_paid_amount: parseFloat(data.insurance_paid_amount),
          patient_responsibility_amount: parseFloat(data.patient_responsibility_amount),
          patient_paid_amount: parseFloat(data.patient_paid_amount),
        }
      }, {
        onSuccess: () => {
          setSelectedPaymentId(null);
          toast({
            title: "Payment Reconciled",
            description: "The payment has been successfully reconciled",
            variant: "default",
          });
        },
        onError: (error) => {
          toast({
            title: "Failed to reconcile payment",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">ERA Management</h2>
        <div className="flex space-x-2">
          <Button 
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Bug className="h-4 w-4" />
            {showDebugLogs ? "Hide Debug Logs" : "Show Debug Logs"}
          </Button>
          <Button 
            onClick={handleRetrieveEra}
            disabled={isRetrieving}
            className="flex items-center gap-2"
          >
            {isRetrieving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Retrieve ERA Files
          </Button>
        </div>
      </div>
      
      {retrieveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Processing ERA Files</AlertTitle>
          <AlertDescription>
            {retrieveError instanceof Error 
              ? (retrieveError.message.includes('AccountKey')
                  ? "Authentication Error: Verify the API key configuration and request format."
                  : (retrieveError.message.includes('endpoint')
                      ? "Endpoint Error: The ERA API endpoint format may be incorrect."
                      : retrieveError.message))
              : String(retrieveError)}
            <p className="mt-2 text-sm">Check the debug logs for complete request and response details.</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Debug Logs Section */}
      {showDebugLogs && (
        <Card className="mb-4 border-dashed border-orange-300">
          <CardHeader className="pb-3 bg-orange-50">
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              API Debug Logs
            </CardTitle>
            <CardDescription>
              Raw HTTP requests and responses for API interactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingLogs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : apiLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No API logs available</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Code</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiLogs.map((log) => (
                      <TableRow key={log.id} className={log.status === 'error' ? 'bg-red-50' : undefined}>
                        <TableCell>{new Date(log.created_at).toLocaleTimeString()}</TableCell>
                        <TableCell>{log.endpoint}</TableCell>
                        <TableCell>{log.status}</TableCell>
                        <TableCell>
                          {log.response_data && typeof log.response_data === 'object' && 
                           'status' in log.response_data && 
                           (typeof log.response_data.status === 'string' || typeof log.response_data.status === 'number') 
                            ? String(log.response_data.status)
                            : (log.status === 'error' ? 'Error' : 'OK')
                          }
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedDebugLog(log)}
                          >
                            <Code className="h-4 w-4" />
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      <Tabs defaultValue="unreconciled">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="unreconciled" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Payments to Reconcile
          </TabsTrigger>
          <TabsTrigger value="era-files" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            ERA Files
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="unreconciled" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Payments Requiring Reconciliation</CardTitle>
              <CardDescription>
                Review and process incoming insurance payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unreconciledError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    Failed to load unreconciled payments: {unreconciledError instanceof Error ? unreconciledError.message : String(unreconciledError)}
                  </AlertDescription>
                </Alert>
              )}
              
              {isLoadingUnreconciled ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : unreconciledPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>All payments have been reconciled</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Date of Service</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Check/EFT</TableHead>
                        <TableHead>Insurance Paid</TableHead>
                        <TableHead>Patient Resp.</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unreconciledPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{payment.client_name || 'Unknown'}</TableCell>
                          <TableCell>{formatDate(payment.start_at)}</TableCell>
                          <TableCell>{formatDate(payment.era_payment_date)}</TableCell>
                          <TableCell>{payment.era_check_eft_number || 'N/A'}</TableCell>
                          <TableCell>{formatCurrency(payment.insurance_paid_amount)}</TableCell>
                          <TableCell>{formatCurrency(payment.patient_responsibility_amount)}</TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedPaymentId(payment.id)}
                            >
                              Reconcile
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="era-files" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>ERA Files</CardTitle>
              <CardDescription>
                Electronic Remittance Advice files received from payers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eraListError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    Failed to load ERA files: {eraListError instanceof Error ? eraListError.message : String(eraListError)}
                  </AlertDescription>
                </Alert>
              )}
              
              {isLoadingEraList ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : eraList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No ERA files have been processed yet</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ERA ID</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Check/EFT Number</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eraList.map((era) => (
                        <TableRow key={era.era_claimmd_id}>
                          <TableCell>{era.era_claimmd_id}</TableCell>
                          <TableCell>{formatDate(era.era_payment_date)}</TableCell>
                          <TableCell>{era.era_check_eft_number || 'N/A'}</TableCell>
                          <TableCell>{formatCurrency(era.insurance_paid_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Payment Reconciliation Sheet */}
      <Sheet open={!!selectedPaymentId} onOpenChange={(open) => !open && setSelectedPaymentId(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Reconcile Payment
            </SheetTitle>
            <SheetDescription>
              Review and update payment information
            </SheetDescription>
          </SheetHeader>
          
          {selectedPayment && (
            <div className="py-4">
              <div className="mb-4">
                <h4 className="text-sm font-medium">Payment Details</h4>
                <div className="grid grid-cols-2 gap-1 text-sm mt-1">
                  <div className="text-muted-foreground">Patient:</div>
                  <div>{selectedPayment.client_name || 'Unknown'}</div>
                  <div className="text-muted-foreground">Date of Service:</div>
                  <div>{formatDate(selectedPayment.start_at)}</div>
                  <div className="text-muted-foreground">ERA ID:</div>
                  <div>{selectedPayment.era_claimmd_id}</div>
                </div>
              </div>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="insurance_paid_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Insurance Paid Amount</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="patient_responsibility_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patient Responsibility Amount</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="patient_payment_status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patient Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="billed">Billed to Patient</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="waived">Waived</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="patient_paid_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patient Paid Amount</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="billing_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Notes</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex justify-end gap-2 pt-2">
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setSelectedPaymentId(null)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      disabled={isReconciling}
                    >
                      {isReconciling && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </SheetContent>
      </Sheet>
      
      {/* Debug Log Details Dialog */}
      <Dialog open={!!selectedDebugLog} onOpenChange={(open) => !open && setSelectedDebugLog(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Raw HTTP Request & Response
            </DialogTitle>
            <DialogDescription>
              {selectedDebugLog?.endpoint} - {new Date(selectedDebugLog?.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[60vh]">
            <div className="space-y-6 p-1">
              {selectedDebugLog?.request_payload?.formatted_request ? (
                <div className="space-y-2">
                  <h3 className="font-semibold">Complete Raw HTTP Request</h3>
                  <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto whitespace-pre-wrap">
                    {selectedDebugLog.request_payload.formatted_request}
                  </pre>
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="font-semibold">HTTP Request</h3>
                  <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedDebugLog?.request_payload, null, 2)}
                  </pre>
                </div>
              )}

              {selectedDebugLog?.response_data?.formatted_response ? (
                <div className="space-y-2">
                  <h3 className="font-semibold">Complete Raw HTTP Response</h3>
                  <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto whitespace-pre-wrap">
                    {selectedDebugLog.response_data.formatted_response}
                  </pre>
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="font-semibold">HTTP Response</h3>
                  <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedDebugLog?.response_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedDebugLog?.error_message && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Error</h3>
                  <pre className="bg-red-900 text-white p-4 rounded-md text-sm overflow-x-auto whitespace-pre-wrap">
                    {selectedDebugLog.error_message}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
