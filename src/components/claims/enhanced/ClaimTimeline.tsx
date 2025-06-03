
import { formatDistanceToNow } from "date-fns";
import { Calendar, CreditCard, Clock } from "lucide-react";

interface ClaimTimelineProps {
  status: {
    last_submission_date: string | null;
    last_status_check: string | null;
  };
  payment: {
    era_payment_date: string | null;
    era_check_eft_number: string | null;
  };
}

export default function ClaimTimeline({ status, payment }: ClaimTimelineProps) {
  const formatTimelineDate = (dateString: string | null) => {
    if (!dateString) return "Not available";
    
    const date = new Date(dateString);
    return `${date.toLocaleDateString()} (${formatDistanceToNow(date, { addSuffix: true })})`;
  };

  return (
    <div className="bg-green-50 rounded-lg p-4">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Timeline
      </h4>
      
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">Submitted</div>
            <div className="text-muted-foreground">
              {formatTimelineDate(status.last_submission_date)}
            </div>
          </div>
        </div>
        
        {status.last_status_check && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Last Status Check</div>
              <div className="text-muted-foreground">
                {formatTimelineDate(status.last_status_check)}
              </div>
            </div>
          </div>
        )}
        
        {payment.era_payment_date && (
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Payment Received</div>
              <div className="text-muted-foreground">
                {formatTimelineDate(payment.era_payment_date)}
                {payment.era_check_eft_number && (
                  <span className="ml-2">
                    (Check/EFT: {payment.era_check_eft_number})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
