
import React from "react";
import { useEraPaymentData } from "@/hooks/useClaimsData";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, DollarSign, FileText, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface PaymentDetailsProps {
  appointmentId: string;
}

export default function PaymentDetails({ appointmentId }: PaymentDetailsProps) {
  const { data: payment, isLoading, error } = useEraPaymentData(appointmentId);
  
  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-destructive">
        <AlertCircle className="h-5 w-5 mr-2" />
        <span>Error loading payment data</span>
      </div>
    );
  }
  
  if (!payment || (!payment.insurance_paid_amount && !payment.denial_details_json)) {
    return (
      <div className="text-center text-muted-foreground p-4">
        <p>No payment information available</p>
      </div>
    );
  }
  
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

  // Format denial details - handle both string and JSON formats
  const formatDenialDetails = (denialDetails: any) => {
    if (!denialDetails) return 'Unknown reason';
    
    if (typeof denialDetails === 'string') {
      try {
        // Try to parse in case it's a JSON string
        const parsedDetails = JSON.parse(denialDetails);
        return Array.isArray(parsedDetails) 
          ? parsedDetails.map(d => d.reason || d.code || JSON.stringify(d)).join('; ')
          : denialDetails;
      } catch {
        // If not valid JSON, return as is
        return denialDetails;
      }
    } else {
      // Already an object or array
      return Array.isArray(denialDetails)
        ? denialDetails.map(d => d.reason || d.code || JSON.stringify(d)).join('; ')
        : JSON.stringify(denialDetails);
    }
  };
  
  const handleViewAdjustmentDetails = () => {
    if (!payment.insurance_adjustment_details_json) {
      toast({
        title: "No adjustment details",
        description: "There are no adjustment details available for this payment.",
        variant: "destructive",
      });
      return;
    }
  };
  
  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <h3 className="text-lg font-medium flex items-center mb-3">
          <DollarSign className="h-5 w-5 mr-2" />
          Payment Information
        </h3>
        
        {payment.denial_details_json && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-md">
            <div className="font-medium text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" /> 
              Claim Denied
            </div>
            <p className="text-sm text-red-800">
              {formatDenialDetails(payment.denial_details_json)}
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="font-medium">Payment Date:</div>
          <div>{formatDate(payment.era_payment_date)}</div>
          
          <div className="font-medium">Check/EFT Number:</div>
          <div>{payment.era_check_eft_number || 'N/A'}</div>
          
          <div className="font-medium">Insurance Paid:</div>
          <div>{formatCurrency(payment.insurance_paid_amount)}</div>
          
          <div className="font-medium">Insurance Adjustment:</div>
          <div>{formatCurrency(payment.insurance_adjustment_amount)}</div>
          
          <div className="font-medium">Patient Responsibility:</div>
          <div>{formatCurrency(payment.patient_responsibility_amount)}</div>
        </div>
        
        {payment.insurance_adjustment_details_json && (
          <div className="mt-2">
            <Separator className="mb-2" />
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  View Adjustment Details
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adjustment Details</DialogTitle>
                  <DialogDescription>
                    Insurance adjustment codes and reasons
                  </DialogDescription>
                </DialogHeader>
                <div className="overflow-auto max-h-[400px]">
                  <pre className="text-xs bg-gray-50 p-3 rounded">
                    {JSON.stringify(payment.insurance_adjustment_details_json, null, 2)}
                  </pre>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
