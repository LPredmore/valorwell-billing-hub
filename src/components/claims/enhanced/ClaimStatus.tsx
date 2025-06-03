
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface ClaimStatusProps {
  status: {
    claim_status: string;
    last_submission_date: string | null;
    last_status_check: string | null;
    response_details: any;
    denial_details: any;
  };
}

export default function ClaimStatus({ status }: ClaimStatusProps) {
  const getDenialMessage = () => {
    if (!status.denial_details) return null;
    
    // Handle different formats of denial details
    if (typeof status.denial_details === 'string') {
      return status.denial_details;
    }
    
    if (status.denial_details.reason) {
      return status.denial_details.reason;
    }
    
    if (status.denial_details.message) {
      return status.denial_details.message;
    }
    
    return "Claim was denied - check detailed response for more information";
  };

  const getResponseMessage = () => {
    if (!status.response_details) return null;
    
    if (typeof status.response_details === 'string') {
      return status.response_details;
    }
    
    if (status.response_details.message) {
      return status.response_details.message;
    }
    
    if (status.response_details.status_description) {
      return status.response_details.status_description;
    }
    
    return null;
  };

  const getStatusIcon = () => {
    switch (status.claim_status?.toLowerCase()) {
      case "paid":
      case "payment received":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "rejected":
      case "denied":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-blue-600" />;
    }
  };

  const denialMessage = getDenialMessage();
  const responseMessage = getResponseMessage();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <h4 className="font-medium">Status Details</h4>
      </div>
      
      <div className="bg-yellow-50 rounded-lg p-4">
        <div className="text-sm space-y-2">
          <div>
            <span className="text-muted-foreground">Current Status:</span>
            <span className="ml-2 font-medium">{status.claim_status}</span>
          </div>
          
          {responseMessage && (
            <div>
              <span className="text-muted-foreground">Response:</span>
              <span className="ml-2">{responseMessage}</span>
            </div>
          )}
        </div>
      </div>

      {denialMessage && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Denial Reason:</strong> {denialMessage}
          </AlertDescription>
        </Alert>
      )}
      
      {status.response_details && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show Technical Details
          </summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
            {JSON.stringify(status.response_details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
