
import { DollarSign, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  parseAdjustmentDetails, 
  formatCurrency, 
  calculateFinancialSummary 
} from "@/utils/claimDataParsers";

interface ClaimFinancialsProps {
  financial: {
    billed_amount: number;
    insurance_paid_amount: number | null;
    patient_responsibility_amount: number | null;
    insurance_adjustment_amount: number | null;
    insurance_adjustment_details: any;
  };
}

const getAdjustmentTypeIcon = (type: string) => {
  switch (type) {
    case 'contractual':
      return <TrendingDown className="h-3 w-3 text-blue-600" />;
    case 'denial':
      return <AlertTriangle className="h-3 w-3 text-red-600" />;
    case 'correction':
      return <TrendingUp className="h-3 w-3 text-green-600" />;
    default:
      return <DollarSign className="h-3 w-3 text-gray-600" />;
  }
};

const getAdjustmentTypeBadgeVariant = (type: string) => {
  switch (type) {
    case 'contractual':
      return 'secondary';
    case 'denial':
      return 'destructive';
    case 'correction':
      return 'outline';
    default:
      return 'outline';
  }
};

export default function ClaimFinancials({ financial }: ClaimFinancialsProps) {
  const parsedAdjustments = parseAdjustmentDetails(financial.insurance_adjustment_details);
  const financialSummary = calculateFinancialSummary(financial);

  return (
    <div className="bg-green-50 rounded-lg p-4 space-y-4">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <DollarSign className="h-4 w-4" />
        Financial Summary
      </h4>
      
      {/* Main Financial Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="text-center">
          <div className="text-muted-foreground">Billed Amount</div>
          <div className="font-semibold text-lg">{formatCurrency(financialSummary.billedAmount)}</div>
        </div>
        
        <div className="text-center">
          <div className="text-muted-foreground">Insurance Paid</div>
          <div className="font-semibold text-lg text-green-600">
            {financialSummary.insurancePaid > 0 ? formatCurrency(financialSummary.insurancePaid) : "Pending"}
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-muted-foreground">Patient Responsibility</div>
          <div className="font-semibold text-lg text-blue-600">
            {financialSummary.patientResponsibility > 0 ? formatCurrency(financialSummary.patientResponsibility) : "—"}
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-muted-foreground">Outstanding</div>
          <div className={`font-semibold text-lg ${financialSummary.outstandingBalance > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
            {financialSummary.outstandingBalance > 0 ? formatCurrency(financialSummary.outstandingBalance) : "—"}
          </div>
        </div>
      </div>

      {/* Adjustment Details */}
      {parsedAdjustments && parsedAdjustments.adjustments.length > 0 && (
        <div className="border-t pt-4">
          <h5 className="font-medium text-sm mb-3">Insurance Adjustments</h5>
          
          {/* Adjustment Summary */}
          {parsedAdjustments.totalAdjustment > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
              {parsedAdjustments.contractualAdjustments > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3 w-3 text-blue-600" />
                  <span className="text-muted-foreground">Contractual:</span>
                  <span className="font-medium">{formatCurrency(parsedAdjustments.contractualAdjustments)}</span>
                </div>
              )}
              
              {parsedAdjustments.denialAdjustments > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-red-600" />
                  <span className="text-muted-foreground">Denials:</span>
                  <span className="font-medium text-red-600">{formatCurrency(parsedAdjustments.denialAdjustments)}</span>
                </div>
              )}
              
              {parsedAdjustments.correctionAdjustments > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-muted-foreground">Corrections:</span>
                  <span className="font-medium">{formatCurrency(parsedAdjustments.correctionAdjustments)}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Individual Adjustments */}
          <div className="space-y-2">
            {parsedAdjustments.adjustments.map((adjustment, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                <div className="flex items-center gap-2">
                  {getAdjustmentTypeIcon(adjustment.type)}
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getAdjustmentTypeBadgeVariant(adjustment.type)} className="text-xs">
                        {adjustment.code}
                      </Badge>
                      <span className="text-sm font-medium">{formatCurrency(adjustment.amount)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{adjustment.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outstanding Balance Alert */}
      {financialSummary.outstandingBalance > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Outstanding balance of {formatCurrency(financialSummary.outstandingBalance)} requires follow-up action.
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Status Summary */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Payment Status:</span>
          <Badge variant={financialSummary.isFullyPaid ? "outline" : "secondary"} 
                className={financialSummary.isFullyPaid ? "bg-green-50 text-green-700 border-green-200" : ""}>
            {financialSummary.isFullyPaid ? "Fully Paid" : 
             financialSummary.isPartiallyPaid ? "Partially Paid" : "Unpaid"}
          </Badge>
        </div>
        
        {financialSummary.totalRecovered > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            Recovery Rate: {financialSummary.recoveryRate}%
          </div>
        )}
      </div>
    </div>
  );
}
