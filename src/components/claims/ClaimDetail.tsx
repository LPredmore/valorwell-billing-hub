import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ClaimDetailProps {
  appointmentId: string;
  onClose: () => void;
}

interface AppointmentData {
  id: string;
  start_at: string;
  client_id: string;
  clinician_id: string;
  clients?: {
    client_first_name: string;
    client_last_name: string;
  };
  clinicians?: {
    clinician_first_name: string;
    clinician_last_name: string;
  };
  CMS1500_claims?: Array<{
    remote_claimid: string;
    status: string;
    last_submission: string;
    proc_code: string;
    charge: number;
  }>;
}

export default function ClaimDetail({ appointmentId, onClose }: ClaimDetailProps) {
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchAppointment() {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            id,
            start_at,
            client_id,
            clinician_id,
            clients:client_id(
              client_first_name,
              client_last_name
            ),
            clinicians:clinician_id(
              clinician_first_name,
              clinician_last_name
            ),
            CMS1500_claims(
              remote_claimid,
              status,
              last_submission,
              proc_code,
              charge
            )
          `)
          .eq('id', appointmentId)
          .single();

        if (error) throw error;
        setAppointment(data);
      } catch (error) {
        console.error('Error fetching appointment:', error);
        toast({
          title: "Error",
          description: "Failed to load appointment details",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchAppointment();
  }, [appointmentId, toast]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="text-center p-8">
        <p>Appointment not found</p>
      </div>
    );
  }

  const claim = appointment.CMS1500_claims?.[0];
  const clientName = appointment.clients 
    ? `${appointment.clients.client_first_name} ${appointment.clients.client_last_name}`
    : 'Unknown Client';
  const clinicianName = appointment.clinicians
    ? `${appointment.clinicians.clinician_first_name} ${appointment.clinicians.clinician_last_name}`
    : 'Unknown Clinician';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Claim Details</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <Label className="font-medium">Client:</Label>
          <p>{clientName}</p>
        </div>
        <div>
          <Label className="font-medium">Clinician:</Label>
          <p>{clinicianName}</p>
        </div>
        <div>
          <Label className="font-medium">Date:</Label>
          <p>{new Date(appointment.start_at).toLocaleDateString()}</p>
        </div>
        {claim && (
          <div>
            <Label className="font-medium">Claim ID:</Label>
            <p>{claim.remote_claimid}</p>
          </div>
        )}
      </div>

      <Tabs defaultValue="billing">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="billing">Billing Details</TabsTrigger>
          <TabsTrigger value="claim" disabled={!claim}>
            Claim Status
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {claim ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cpt_code">CPT Code</Label>
                      <Input 
                        id="cpt_code" 
                        value={claim.proc_code || ''} 
                        readOnly 
                      />
                    </div>
                    <div>
                      <Label htmlFor="billed_amount">Billed Amount</Label>
                      <Input 
                        id="billed_amount" 
                        value={`$${claim.charge?.toFixed(2) || '0.00'}`} 
                        readOnly 
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No billing information available for this appointment.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="claim">
          <Card>
            <CardHeader>
              <CardTitle>Claim Status</CardTitle>
            </CardHeader>
            <CardContent>
              {claim ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="font-medium">Status:</Label>
                      <Badge variant="secondary">{claim.status}</Badge>
                    </div>
                    <div>
                      <Label className="font-medium">Last Submission:</Label>
                      <p>{claim.last_submission ? new Date(claim.last_submission).toLocaleDateString() : 'Not submitted'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No claim information available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}