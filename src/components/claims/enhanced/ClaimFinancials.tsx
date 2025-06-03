
interface ClaimFinancialsProps {
  financial: {
    billed_amount: number;
    insurance_paid_amount: number | null;
    patient_responsibility_amount: number | null;
    insurance_adjustment_amount: number | null;
    insurance_adjustment_details: any;
  };
}

export default function ClaimFinancials({ financial }: ClaimFinancialsProps) {
  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "—";
    return `$${amount.toFixed(2)}`;
  };

  const getOutstandingAmount = () => {
    const billed = financial.billed_amount || 0;
    const paid = financial.insurance_paid_amount || 0;
    const adjustment = financial.insurance_adjustment_amount || 0;
    return billed - paid - adjustment;
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h4 className="font-medium mb-3">Financial Summary</h4>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Billed Amount</div>
          <div className="font-semibold text-lg">{formatCurrency(financial.billed_amount)}</div>
        </div>
        
        <div>
          <div className="text-muted-foreground">Insurance Paid</div>
          <div className="font-semibold text-lg text-green-600">
            {formatCurrency(financial.insurance_paid_amount)}
          </div>
        </div>
        
        <div>
          <div className="text-muted-foreground">Patient Responsibility</div>
          <div className="font-semibold text-lg text-orange-600">
            {formatCurrency(financial.patient_responsibility_amount)}
          </div>
        </div>
        
        <div>
          <div className="text-muted-foreground">Outstanding</div>
          <div className="font-semibold text-lg text-red-600">
            {formatCurrency(getOutstandingAmount())}
          </div>
        </div>
      </div>
      
      {financial.insurance_adjustment_amount && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground">Adjustment:</span>
            <span className="ml-2 font-medium">{formatCurrency(financial.insurance_adjustment_amount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
