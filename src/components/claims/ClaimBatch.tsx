
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle, FilePlus } from "lucide-react";
import { useClaimSubmission } from "@/hooks/useClaimsData";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClaimBatchProps {
  selectedAppointmentIds: string[];
  onSuccess: () => void;
}

export default function ClaimBatch({ selectedAppointmentIds, onSuccess }: ClaimBatchProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  
  const { mutate: submitClaims, isPending } = useClaimSubmission();

  const handleSubmit = () => {
    setShowConfirmDialog(false);
    
    submitClaims(selectedAppointmentIds, {
      onSuccess: (data) => {
        setSubmissionResult({
          success: true,
          data,
        });
        setShowResultDialog(true);
        onSuccess();
      },
      onError: (error: any) => {
        // Check if the error includes detailed rejection information
        const errorDetails = error.response?.data?.details || error.response?.data?.claimData || [];
        
        setSubmissionResult({
          success: false,
          error: error instanceof Error ? error.message : "An unknown error occurred",
          details: errorDetails,
        });
        setShowResultDialog(true);
      },
    });
  };

  return (
    <>
      <Card className="bg-muted/40">
        <CardContent className="p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Batch Submission</h3>
              <p className="text-sm text-muted-foreground">
                {selectedAppointmentIds.length} appointment{selectedAppointmentIds.length !== 1 ? 's' : ''} selected for submission
              </p>
            </div>
            
            <Button
              className="w-full"
              disabled={selectedAppointmentIds.length === 0 || isPending}
              onClick={() => setShowConfirmDialog(true)}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <FilePlus className="mr-2 h-4 w-4" />
                  Submit Claims Batch
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Claims Batch</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to submit {selectedAppointmentIds.length} claim{selectedAppointmentIds.length !== 1 ? 's' : ''} to Claim.MD.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Submit Claims</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <AlertDialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {submissionResult?.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Claims Submitted Successfully
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Submission Failed
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {submissionResult?.success ? (
                <>
                  <p>Your claims batch was submitted to Claim.MD successfully.</p>
                  <p className="font-medium">Batch ID: {submissionResult.data.batchId}</p>
                </>
              ) : (
                <>
                  <p>There was an error submitting your claims batch:</p>
                  <p className="text-red-500 font-medium">{submissionResult?.error}</p>
                  
                  {/* Display detailed error messages if available */}
                  {submissionResult?.details && submissionResult.details.length > 0 && (
                    <div className="mt-4">
                      <p className="font-medium">Validation Errors:</p>
                      <div className="mt-2 max-h-60 overflow-y-auto border rounded bg-slate-50 p-3 text-sm">
                        {Array.isArray(submissionResult.details) ? (
                          <ul className="list-disc pl-5 space-y-1">
                            {submissionResult.details.map((item: any, index: number) => (
                              <li key={index}>
                                {item.message || item.error || JSON.stringify(item)}
                                {item.fields && <span className="text-slate-500"> (Field: {item.fields})</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{JSON.stringify(submissionResult.details, null, 2)}</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
