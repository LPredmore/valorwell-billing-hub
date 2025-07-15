import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentDetailsProps {
  appointmentId: string;
  onClose?: () => void;  // Added onClose as an optional prop
}

export default function PaymentDetails({ appointmentId, onClose }: PaymentDetailsProps) {
  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium flex items-center">
            <DollarSign className="h-5 w-5 mr-2" />
            Payment Information
          </h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-2">
              Close
            </Button>
          )}
        </div>
        
        <div className="text-center text-muted-foreground p-4">
          <p>Payment details will be available after ClaimMD integration is complete.</p>
          <p className="text-sm mt-2">Appointment ID: {appointmentId}</p>
        </div>
      </CardContent>
    </Card>
  );
}
