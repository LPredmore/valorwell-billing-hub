
import React, { useState, useEffect } from "react";
import { useEraList, useEraRetrieval, useUnreconciledPayments, useReconcilePayment } from "@/hooks/useClaimsData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCcw, AlertCircle, CheckCircle, FileText, DollarSign } from "lucide-react";
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

export default function EraManagement() {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const { data: eraList = [], isLoading: isLoadingEraList } = useEraList();
  const { data: unreconciledPayments = [], isLoading: isLoadingUnreconciled } = useUnreconciledPayments();
  const { mutate: retrieveEra, isPending: isRetrieving } = useEraRetrieval();
  const { mutate: reconcilePayment, isPending: isReconciling } = useReconcilePayment();
  
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

  const handleRetrieveEra = () => {
    retrieveEra();
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
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">ERA Management</h2>
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
    </div>
  );
}
