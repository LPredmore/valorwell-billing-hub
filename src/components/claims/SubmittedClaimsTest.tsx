
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface SimpleClaimData {
  id: string;
  start_at: string;
  claimid: string;
  claim_status: string;
  billed_amount: number;
  client_name: string;
  clinician_name: string;
}

export default function SubmittedClaimsTest() {
  const [claims, setClaims] = useState<SimpleClaimData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClaims() {
      try {
        console.log('=== SIMPLIFIED CLAIMS TEST - STARTING FETCH ===');
        setIsLoading(true);
        setError(null);

        // Step 1: Get appointments with claims from CMS1500_claims table
        const { data: appointments, error: apptError } = await supabase
          .from('appointments')
          .select(`
            id, 
            start_at, 
            client_id, 
            clinician_id,
            CMS1500_claims!inner(
              remote_claimid,
              status,
              charge
            )
          `)
          .order('start_at', { ascending: false })
          .limit(10);

        if (apptError) {
          throw new Error(`Appointments query failed: ${apptError.message}`);
        }

        console.log('Found appointments with claims:', appointments?.length || 0);
        
        if (!appointments || appointments.length === 0) {
          setClaims([]);
          return;
        }

        // Step 2: Get client names
        const clientIds = [...new Set(appointments.map(a => a.client_id))];
        const { data: clients, error: clientError } = await supabase
          .from('clients')
          .select('id, client_first_name, client_last_name')
          .in('id', clientIds);

        if (clientError) {
          throw new Error(`Clients query failed: ${clientError.message}`);
        }

        // Step 3: Get clinician names
        const clinicianIds = [...new Set(appointments.map(a => a.clinician_id))];
        const { data: clinicians, error: clinicianError } = await supabase
          .from('clinicians')
          .select('id, clinician_first_name, clinician_last_name')
          .in('id', clinicianIds);

        if (clinicianError) {
          throw new Error(`Clinicians query failed: ${clinicianError.message}`);
        }

        console.log('Fetched clients:', clients?.length || 0);
        console.log('Fetched clinicians:', clinicians?.length || 0);

        // Step 4: Combine data
        const clientMap = new Map(clients?.map(c => [c.id, c]) || []);
        const clinicianMap = new Map(clinicians?.map(c => [c.id, c]) || []);

        const formattedClaims: SimpleClaimData[] = appointments
          .filter(appt => appt.CMS1500_claims.length > 0)
          .map(appt => {
            const client = clientMap.get(appt.client_id);
            const clinician = clinicianMap.get(appt.clinician_id);
            const claim = appt.CMS1500_claims[0]; // Get first claim

            return {
              id: appt.id,
              start_at: appt.start_at,
              claimid: claim.remote_claimid || '',
              claim_status: claim.status || 'Unknown',
              billed_amount: claim.charge || 0,
              client_name: client ? `${client.client_first_name || ''} ${client.client_last_name || ''}`.trim() : 'Unknown Client',
              clinician_name: clinician ? `${clinician.clinician_first_name || ''} ${clinician.clinician_last_name || ''}`.trim() : 'Unknown Clinician'
            };
          });

        console.log('Final formatted claims:', formattedClaims.length);
        console.log('Sample claim:', formattedClaims[0]);

        setClaims(formattedClaims);

      } catch (err) {
        console.error('=== ERROR IN SIMPLIFIED CLAIMS TEST ===', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    fetchClaims();
  }, []);

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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Test Component Error</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-600 bg-red-50 p-4 rounded">
            <p className="font-medium">Failed to load claims:</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-blue-600">🧪 Simplified Claims Test</CardTitle>
        <p className="text-sm text-muted-foreground">
          Testing basic data flow without complex transformations
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-3 border rounded">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : claims.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-lg font-medium">No submitted claims found</p>
            <p className="text-sm mt-2">This test component found no appointments with claimid values</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-medium text-green-600 mb-4">
              ✅ Found {claims.length} submitted claims
            </div>
            {claims.map(claim => (
              <div key={claim.id} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                <div className="flex-1">
                  <div className="font-medium">{claim.client_name}</div>
                  <div className="text-sm text-muted-foreground">
                    Provider: {claim.clinician_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Date: {new Date(claim.start_at).toLocaleDateString()} • 
                    Claim ID: {claim.claimid} • 
                    Amount: ${claim.billed_amount.toFixed(2)}
                  </div>
                </div>
                <div className="ml-4">
                  {getStatusBadge(claim.claim_status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
