import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Function runtime is not configured" }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const slotStartUtc = body?.slot_start_utc;
    const slotEndUtc = body?.slot_end_utc ?? null;
    if (!slotStartUtc) return json({ error: "slot_start_utc is required" }, 400);

    const { data: authority, error: authorityError } = await supabase.rpc(
      "get_current_client_therapist_authority",
    );
    if (authorityError) {
      console.error("[book-client-appointment] Therapist authority failed", authorityError);
      return json({ error: "Unable to evaluate therapist booking authority" }, 400);
    }

    const pendingFirstAppointment =
      authority?.match_state === "pending_first_appointment" &&
      authority?.can_book_first_appointment === true;

    const rpcName = pendingFirstAppointment
      ? "book_pending_therapist_match_appointment"
      : "book_client_appointment";
    const rpcArgs = pendingFirstAppointment
      ? {
          p_slot_start_utc: slotStartUtc,
          p_slot_end_utc: slotEndUtc,
          p_idempotency_key:
            body?.idempotency_key ?? `first-appointment:${user.id}:${slotStartUtc}`,
        }
      : {
          p_slot_start_utc: slotStartUtc,
          p_slot_end_utc: slotEndUtc,
        };

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);

    if (error) {
      console.error(`[book-client-appointment] ${rpcName} failed`, error);
      const conflict = error.code === "40001" || error.code === "23505";
      return json(
        { error: error.message || "Failed to book appointment", code: error.code },
        conflict ? 409 : 400,
      );
    }

    const result = data as {
      success: boolean;
      appointment_id: string;
      client_id: string;
      staff_id: string;
      display_time?: string;
      appointment_start?: string;
      lifecycle_stage?: string;
      scheduling_branch?: string;
      match_id?: string;
      relationship_id?: string;
      match_state?: string;
    };

    const warnings: string[] = [];

    // New first-appointment matches enqueue a durable clinician notification in
    // the same database transaction. Existing confirmed relationships retain the
    // current notification path until all appointment notifications use outbox.
    if (!pendingFirstAppointment) {
      const { error: notificationError } = await supabase.functions.invoke(
        "notify-therapist-selection",
        {
          body: {
            therapistId: result.staff_id,
            clientId: result.client_id,
            notificationType: "self_scheduled",
            appointmentId: result.appointment_id,
          },
        },
      );

      if (notificationError) {
        warnings.push("Therapist notification delivery needs review.");
        console.error("[book-client-appointment] Notification failed", notificationError);
      }
    }

    const workerResponse = await fetch(
      `${supabaseUrl}/functions/v1/appointment-provisioning-worker`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appointmentId: result.appointment_id,
          limit: 1,
          workerId: `client-booking-${crypto.randomUUID()}`,
        }),
      },
    );

    if (!workerResponse.ok) {
      warnings.push("Video-room and calendar provisioning are queued for automatic retry.");
      console.error("[book-client-appointment] Provisioning worker failed", await workerResponse.text());
    }

    return json({
      ...result,
      display_time: result.display_time ?? result.appointment_start ?? "Your appointment has been scheduled.",
      notification_warning: warnings.length ? warnings.join(" ") : null,
      provisioning: workerResponse.ok ? "completed_or_not_required" : "queued",
      therapist_authority_path: pendingFirstAppointment ? "pending_match_activation" : "confirmed_relationship",
    }, 201);
  } catch (error) {
    console.error("[book-client-appointment] Unexpected error", error);
    return json({ error: "Internal server error" }, 500);
  }
});
