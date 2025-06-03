
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface ClaimHeaderProps {
  client: { name: string; insurance: string };
  provider: { name: string };
  appointmentDate: string;
  claimId: string;
  status: string;
}

export default function ClaimHeader({ 
  client, 
  provider, 
  appointmentDate, 
  claimId, 
  status 
}: ClaimHeaderProps) {
  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
      case "payment received":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>;
      case "submitted to clearinghouse":
      case "submitted":
        return <Badge variant="secondary">Submitted</Badge>;
      case "rejected":
      case "denied":
        return <Badge variant="destructive">Rejected</Badge>;
      case "accepted":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Accepted</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg">{client.name}</h3>
        {getStatusBadge(status)}
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
        <div>
          <div><strong>Provider:</strong> {provider.name}</div>
          <div><strong>Insurance:</strong> {client.insurance || "Not specified"}</div>
        </div>
        <div>
          <div><strong>Date:</strong> {new Date(appointmentDate).toLocaleDateString()}</div>
          <div><strong>Claim ID:</strong> <span className="font-mono">{claimId}</span></div>
        </div>
      </div>
    </div>
  );
}
