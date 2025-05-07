
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Save, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useBillableAppointments, useUpdateBillingDetails } from "@/hooks/useClaimsData";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ClaimDetailProps {
  appointmentId: string;
  onClose: () => void;
}

export default function ClaimDetail({
  appointmentId,
  onClose,
}: ClaimDetailProps) {
  const [appointment, setAppointment] = useState<any>(null);
  const { data: appointments } = useBillableAppointments();
  const { mutate: updateBillingDetails, isPending } = useUpdateBillingDetails();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (appointments) {
      const found = appointments.find((appt) => appt.id === appointmentId);
      if (found) {
        setAppointment(found);
      }
    }
  }, [appointmentId, appointments]);

  const form = useForm({
    defaultValues: {
      cpt_code: appointment?.service.cpt_code || "",
      modifiers: appointment?.service.modifiers?.join(", ") || "",
      diagnosis_code_pointers: appointment?.service.diagnosis_pointers || "",
      place_of_service_code: appointment?.service.place_of_service || "11", // Default to office
      billed_amount: appointment?.billing.amount || 0,
    },
  });

  useEffect(() => {
    if (appointment) {
      form.reset({
        cpt_code: appointment.service.cpt_code || "",
        modifiers: appointment.service.modifiers?.join(", ") || "",
        diagnosis_code_pointers: appointment.service.diagnosis_pointers || "",
        place_of_service_code: appointment.service.place_of_service || "11",
        billed_amount: appointment.billing.amount || 0,
      });
    }
  }, [appointment, form]);

  const onSubmit = (data: any) => {
    // Parse modifiers from comma-separated string to array
    const modifiers = data.modifiers ? data.modifiers.split(",").map((m: string) => m.trim()) : [];
    
    // Convert billed_amount to number
    const billed_amount = parseFloat(data.billed_amount);
    
    updateBillingDetails(
      {
        appointmentId,
        billingDetails: {
          ...data,
          modifiers,
          billed_amount,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['billableAppointments'] });
        },
      }
    );
  };

  if (!appointment) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">{appointment.client.name}</h3>
          <p className="text-sm text-muted-foreground">
            {new Date(appointment.start_at).toLocaleDateString()} | {appointment.provider.name}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <Card>
        <CardContent className="p-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cpt_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPT Code</FormLabel>
                      <FormControl>
                        <Input placeholder="90834" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="modifiers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modifiers</FormLabel>
                      <FormControl>
                        <Input placeholder="95, GT (comma separated)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="place_of_service_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Place of Service</FormLabel>
                      <FormControl>
                        <Input placeholder="11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billed_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billed Amount</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="diagnosis_code_pointers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diagnosis Pointers</FormLabel>
                    <FormControl>
                      <Textarea placeholder="1,2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Details
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
