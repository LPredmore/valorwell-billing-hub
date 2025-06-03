
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import ClaimHeader from "./ClaimHeader";
import ClaimFinancials from "./ClaimFinancials";
import ClaimClinical from "./ClaimClinical";
import ClaimStatus from "./ClaimStatus";
import ClaimTimeline from "./ClaimTimeline";
import ClaimNotes from "./ClaimNotes";

interface ClaimCardProps {
  claim: {
    id: string;
    start_at: string;
    claim_claimmd_id: string;
    client: { id: string; name: string; insurance: string };
    provider: { id: string; name: string };
    clinical: {
      cpt_code: string;
      modifiers: string[];
      diagnosis_code_pointers: string;
      place_of_service_code: string;
    };
    financial: {
      billed_amount: number;
      insurance_paid_amount: number | null;
      patient_responsibility_amount: number | null;
      insurance_adjustment_amount: number | null;
      insurance_adjustment_details: any;
    };
    status: {
      claim_status: string;
      last_submission_date: string | null;
      last_status_check: string | null;
      response_details: any;
      denial_details: any;
    };
    payment: {
      era_payment_date: string | null;
      era_check_eft_number: string | null;
      era_claimmd_id: string | null;
    };
    notes: { billing_notes: string | null };
  };
  isSelected?: boolean;
  onSelect?: () => void;
}

export default function ClaimCard({ claim, isSelected, onSelect }: ClaimCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className={`mb-4 ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <ClaimHeader 
            client={claim.client}
            provider={claim.provider}
            appointmentDate={claim.start_at}
            claimId={claim.claim_claimmd_id}
            status={claim.status.claim_status}
          />
          <div className="flex gap-2">
            {onSelect && (
              <Button variant="ghost" size="sm" onClick={onSelect}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Always show financial summary */}
        <ClaimFinancials financial={claim.financial} />

        {/* Show expanded details when requested */}
        {isExpanded && (
          <div className="mt-4 space-y-4">
            <ClaimClinical clinical={claim.clinical} />
            <ClaimStatus status={claim.status} />
            <ClaimTimeline 
              status={claim.status}
              payment={claim.payment}
            />
            {claim.notes.billing_notes && (
              <ClaimNotes notes={claim.notes} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
