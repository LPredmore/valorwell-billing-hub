
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, XCircle, Clock, FileText } from "lucide-react";

interface ClaimStatusProps {
  status: {
    claim_status: string;
    last_submission_date: string | null;
    last_status_check: string | null;
    response_details: any;
    denial_details: any;
  };
}

// Enhanced JSON response parsing utilities
const parseClaimMdResponse = (responseData: any) => {
  if (!responseData) return null;

  // Handle different response formats from Claim.MD
  const result = {
    acknowledgmentId: null as string | null,
    batchId: null as string | null,
    statusMessage: null as string | null,
    errorCode: null as string | null,
    errorMessage: null as string | null,
    submissionStatus: null as string | null,
    processedClaims: [] as any[],
    rawData: responseData
  };

  // Extract acknowledgment information
  if (responseData.acknowledgment_id) {
    result.acknowledgmentId = responseData.acknowledgment_id;
  }

  // Extract batch information
  if (responseData.batch_id) {
    result.batchId = responseData.batch_id;
  }

  // Extract status message
  if (responseData.status_message || responseData.message) {
    result.statusMessage = responseData.status_message || responseData.message;
  }

  // Extract error information
  if (responseData.error_code) {
    result.errorCode = responseData.error_code;
  }

  if (responseData.error_message || responseData.error) {
    result.errorMessage = responseData.error_message || responseData.error;
  }

  // Extract submission status
  if (responseData.submission_status) {
    result.submissionStatus = responseData.submission_status;
  }

  // Extract processed claims array
  if (Array.isArray(responseData.claims)) {
    result.processedClaims = responseData.claims;
  } else if (Array.isArray(responseData.processed_claims)) {
    result.processedClaims = responseData.processed_claims;
  }

  return result;
};

const parseDenialDetails = (denialData: any) => {
  if (!denialData) return null;

  const result = {
    primaryReason: null as string | null,
    secondaryReasons: [] as string[],
    adjustmentCodes: [] as string[],
    remarkCodes: [] as string[],
    denialAmount: null as number | null,
    appealDeadline: null as string | null,
    correctionInstructions: null as string | null,
    rawData: denialData
  };

  // Parse different denial data formats
  if (typeof denialData === 'string') {
    result.primaryReason = denialData;
  } else if (typeof denialData === 'object') {
    // Primary denial reason
    if (denialData.reason || denialData.denial_reason || denialData.primary_reason) {
      result.primaryReason = denialData.reason || denialData.denial_reason || denialData.primary_reason;
    }

    // Secondary reasons
    if (Array.isArray(denialData.reasons)) {
      result.secondaryReasons = denialData.reasons;
    } else if (Array.isArray(denialData.secondary_reasons)) {
      result.secondaryReasons = denialData.secondary_reasons;
    }

    // Adjustment codes (CARC - Claim Adjustment Reason Codes)
    if (Array.isArray(denialData.adjustment_codes)) {
      result.adjustmentCodes = denialData.adjustment_codes;
    } else if (Array.isArray(denialData.carc_codes)) {
      result.adjustmentCodes = denialData.carc_codes;
    }

    // Remark codes (RARC - Remittance Advice Remark Codes)
    if (Array.isArray(denialData.remark_codes)) {
      result.remarkCodes = denialData.remark_codes;
    } else if (Array.isArray(denialData.rarc_codes)) {
      result.remarkCodes = denialData.rarc_codes;
    }

    // Denial amount
    if (denialData.denied_amount || denialData.denial_amount) {
      result.denialAmount = Number(denialData.denied_amount || denialData.denial_amount);
    }

    // Appeal deadline
    if (denialData.appeal_deadline || denialData.appeal_by_date) {
      result.appealDeadline = denialData.appeal_deadline || denialData.appeal_by_date;
    }

    // Correction instructions
    if (denialData.correction_instructions || denialData.instructions) {
      result.correctionInstructions = denialData.correction_instructions || denialData.instructions;
    }
  }

  return result;
};

// Get human-readable status descriptions
const getStatusDescription = (status: string) => {
  const statusMap: Record<string, string> = {
    'submitted': 'Claim has been submitted and is being processed',
    'accepted': 'Claim has been accepted by the clearinghouse',
    'rejected': 'Claim was rejected due to errors',
    'paid': 'Claim has been processed and payment issued',
    'denied': 'Claim was denied by the insurance provider',
    'pending': 'Claim is pending review',
    'processing': 'Claim is currently being processed',
    'acknowledgment_received': 'Submission acknowledgment received from clearinghouse'
  };
  
  return statusMap[status.toLowerCase()] || status;
};

export default function ClaimStatus({ status }: ClaimStatusProps) {
  const parsedResponse = parseClaimMdResponse(status.response_details);
  const parsedDenial = parseDenialDetails(status.denial_details);

  const getStatusIcon = () => {
    switch (status.claim_status?.toLowerCase()) {
      case "paid":
      case "payment received":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "rejected":
      case "denied":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "submitted":
      case "processing":
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusBadgeVariant = () => {
    switch (status.claim_status?.toLowerCase()) {
      case "paid":
      case "payment received":
        return "outline" as const;
      case "rejected":
      case "denied":
        return "destructive" as const;
      case "submitted":
      case "processing":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium">Claim Status</h4>
            <Badge variant={getStatusBadgeVariant()} className={
              status.claim_status?.toLowerCase() === "paid" ? "bg-green-50 text-green-700 border-green-200" :
              status.claim_status?.toLowerCase() === "denied" ? "" :
              status.claim_status?.toLowerCase() === "submitted" ? "" :
              "bg-yellow-50 text-yellow-700 border-yellow-200"
            }>
              {status.claim_status || "Unknown"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {getStatusDescription(status.claim_status || "")}
          </p>
        </div>
      </div>

      {/* Parsed Response Information */}
      {parsedResponse && (
        <div className="bg-blue-50 rounded-lg p-4 space-y-3">
          <h5 className="font-medium text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Submission Details
          </h5>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {parsedResponse.acknowledgmentId && (
              <div>
                <span className="text-muted-foreground">Acknowledgment ID:</span>
                <span className="ml-2 font-mono text-xs">{parsedResponse.acknowledgmentId}</span>
              </div>
            )}
            
            {parsedResponse.batchId && (
              <div>
                <span className="text-muted-foreground">Batch ID:</span>
                <span className="ml-2 font-mono text-xs">{parsedResponse.batchId}</span>
              </div>
            )}
            
            {parsedResponse.submissionStatus && (
              <div>
                <span className="text-muted-foreground">Submission Status:</span>
                <span className="ml-2 font-medium">{parsedResponse.submissionStatus}</span>
              </div>
            )}
            
            {parsedResponse.statusMessage && (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Status Message:</span>
                <span className="ml-2">{parsedResponse.statusMessage}</span>
              </div>
            )}
          </div>

          {parsedResponse.errorCode && (
            <Alert variant="destructive" className="mt-3">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error {parsedResponse.errorCode}:</strong> {parsedResponse.errorMessage || "Unknown error"}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Parsed Denial Information */}
      {parsedDenial && parsedDenial.primaryReason && (
        <div className="bg-red-50 rounded-lg p-4 space-y-3">
          <h5 className="font-medium text-sm text-red-800 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Denial Details
          </h5>
          
          <Alert variant="destructive">
            <AlertDescription>
              <strong>Primary Reason:</strong> {parsedDenial.primaryReason}
            </AlertDescription>
          </Alert>

          {parsedDenial.secondaryReasons.length > 0 && (
            <div>
              <span className="text-sm font-medium text-red-800">Additional Reasons:</span>
              <ul className="list-disc list-inside mt-1 text-sm space-y-1">
                {parsedDenial.secondaryReasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedDenial.adjustmentCodes.length > 0 && (
            <div>
              <span className="text-sm font-medium text-red-800">Adjustment Codes:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {parsedDenial.adjustmentCodes.map((code, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {parsedDenial.remarkCodes.length > 0 && (
            <div>
              <span className="text-sm font-medium text-red-800">Remark Codes:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {parsedDenial.remarkCodes.map((code, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {parsedDenial.correctionInstructions && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <span className="text-sm font-medium text-yellow-800">Correction Instructions:</span>
              <p className="text-sm mt-1">{parsedDenial.correctionInstructions}</p>
            </div>
          )}

          {parsedDenial.appealDeadline && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <span className="text-sm font-medium text-blue-800">Appeal Deadline:</span>
              <p className="text-sm mt-1">{new Date(parsedDenial.appealDeadline).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Raw Technical Details */}
      {(status.response_details || status.denial_details) && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
            Show Raw Technical Data
          </summary>
          <div className="mt-3 space-y-3">
            {status.response_details && (
              <div>
                <h6 className="font-medium mb-2">Response Details:</h6>
                <pre className="p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40 border">
                  {JSON.stringify(status.response_details, null, 2)}
                </pre>
              </div>
            )}
            {status.denial_details && (
              <div>
                <h6 className="font-medium mb-2">Denial Details:</h6>
                <pre className="p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40 border">
                  {JSON.stringify(status.denial_details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
