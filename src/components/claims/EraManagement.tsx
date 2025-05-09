
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  useEraList, 
  useUnreconciledPayments,
  useEraDetail,
  useEraRetrieval
} from "@/hooks/useClaimsData";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "../ui/spinner";
import { format, subMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import PaymentDetails from "./PaymentDetails";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, FileText, RefreshCcw } from "lucide-react";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "../ui/date-range-picker";

const EraManagement = () => {
  const { data: eraList, isLoading: loadingEras, refetch: refetchEraList } = useEraList();
  const { data: unreconciledPayments, isLoading: loadingPayments, refetch: refetchPayments } = useUnreconciledPayments();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all-eras");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedEraId, setSelectedEraId] = useState<string | null>(null);
  const { data: eraDetail, isLoading: loadingEraDetail } = useEraDetail(selectedEraId || '');

  // Date range state for ERA retrieval
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 1), // Default to 1 month ago
    to: new Date(),
  });

  const { 
    mutate: retrieveEraFiles, 
    isPending: isRetrievingEra 
  } = useEraRetrieval();

  // Format currency amounts
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  // Format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MM/dd/yyyy');
    } catch (error) {
      return dateString;
    }
  };

  // Handle payment selection
  const handleSelectPayment = (appointmentId: string) => {
    setSelectedAppointmentId(appointmentId);
  };
  
  // Handle ERA selection for detail view
  const handleSelectEra = (eraId: string) => {
    setSelectedEraId(eraId);
  };

  // Handle ERA retrieval with date range
  const handleRetrieveEra = () => {
    if (!dateRange?.from) {
      toast({
        title: "Date range required",
        description: "Please select a start date for ERA retrieval",
        variant: "destructive",
      });
      return;
    }

    // Format dates for API
    const fromDate = dateRange.from.toISOString().split('T')[0];
    const toDate = dateRange.to ? dateRange.to.toISOString().split('T')[0] : fromDate;

    retrieveEraFiles(
      { fromDate, toDate },
      {
        onSuccess: () => {
          refetchEraList();
          refetchPayments();
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="all-eras">ERA Files</TabsTrigger>
          <TabsTrigger value="pending-reconciliation">Pending Reconciliation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all-eras" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle>ERA Files</CardTitle>
              <div className="flex items-center space-x-2">
                <DateRangePicker 
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  disabled={isRetrievingEra}
                />
                <Button 
                  onClick={handleRetrieveEra}
                  variant="outline" 
                  className="flex items-center space-x-1"
                  disabled={isRetrievingEra}
                >
                  {isRetrievingEra ? (
                    <>
                      <RefreshCcw className="h-4 w-4 mr-1 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-1" />
                      <span>Retrieve ERA</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEras ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : eraList && eraList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ERA ID</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Check/EFT #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eraList.map((era) => (
                      <TableRow key={era.era_claimmd_id}>
                        <TableCell className="font-medium">{era.era_claimmd_id}</TableCell>
                        <TableCell>{formatDate(era.era_payment_date)}</TableCell>
                        <TableCell>{era.era_check_eft_number || '-'}</TableCell>
                        <TableCell>{formatCurrency(era.insurance_paid_amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            onClick={() => handleSelectEra(era.era_claimmd_id)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No ERA files have been processed yet.
                </div>
              )}
            </CardContent>
          </Card>

          {selectedEraId && (
            <Dialog open={!!selectedEraId} onOpenChange={() => setSelectedEraId(null)}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>ERA Details - {selectedEraId}</DialogTitle>
                </DialogHeader>
                {loadingEraDetail ? (
                  <div className="flex justify-center py-6">
                    <Spinner size="lg" />
                  </div>
                ) : eraDetail && eraDetail.length > 0 ? (
                  <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>CPT</TableHead>
                          <TableHead>Billed</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>Patient Resp.</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eraDetail.map((claim) => (
                          <TableRow key={claim.id}>
                            <TableCell className="font-medium">{claim.client_name}</TableCell>
                            <TableCell>{claim.clinician_name}</TableCell>
                            <TableCell>{claim.cpt_code || '-'}</TableCell>
                            <TableCell>{formatCurrency(claim.billed_amount)}</TableCell>
                            <TableCell>{formatCurrency(claim.insurance_paid_amount)}</TableCell>
                            <TableCell>{formatCurrency(claim.patient_responsibility_amount)}</TableCell>
                            <TableCell>
                              <Badge className={
                                claim.claim_status === 'Denied' 
                                  ? 'bg-red-100 text-red-800 hover:bg-red-100'
                                  : 'bg-green-100 text-green-800 hover:bg-green-100'
                              }>
                                {claim.claim_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No claims found for this ERA.
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
        
        <TabsContent value="pending-reconciliation" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Payments Pending Reconciliation</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPayments ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : unreconciledPayments && unreconciledPayments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Check/EFT #</TableHead>
                      <TableHead>Insurance Paid</TableHead>
                      <TableHead>Patient Responsibility</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unreconciledPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.client_name}</TableCell>
                        <TableCell>{formatDate(payment.era_payment_date)}</TableCell>
                        <TableCell>{payment.era_check_eft_number || '-'}</TableCell>
                        <TableCell>{formatCurrency(payment.insurance_paid_amount)}</TableCell>
                        <TableCell>{formatCurrency(payment.patient_responsibility_amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            onClick={() => handleSelectPayment(payment.id)}
                          >
                            Reconcile
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No payments pending reconciliation.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {selectedAppointmentId && (
        <PaymentDetails
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
        />
      )}
    </div>
  );
};

export default EraManagement;
