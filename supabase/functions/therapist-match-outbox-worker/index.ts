import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ClaimedItem = {
  outbox_id: string;
  tenant_id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  claim_token: string;
};

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ error: "Worker runtime is not configured" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const authorization = request.headers.get("authorization") ?? "";
  const workerToken = request.headers.get("x-relationship-worker-token") ?? "";
  let authorized = authorization === `Bearer ${serviceRoleKey}`;
  if (!authorized && workerToken) {
    const { data, error } = await admin.rpc("relationship_worker_token_valid", {
      p_tenant_id: TENANT_ID,
      p_token: workerToken,
    });
    authorized = !error && data === true;
  }
  if (!authorized) return json({ error: "Worker authorization is required" }, 403);

  const input = await request.json().catch(() => ({})) as {
    limit?: number;
    workerId?: string;
  };
  const limit = Math.min(Math.max(Number(input.limit ?? 25), 1), 100);
  const workerId = String(input.workerId ?? `therapist-match-worker-${crypto.randomUUID()}`);

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_therapist_match_outbox",
    { p_worker_id: workerId, p_limit: limit, p_lease_seconds: 300 },
  );
  if (claimError) return json({ error: claimError.message }, 500);

  const results: unknown[] = [];

  for (const item of (claimed ?? []) as ClaimedItem[]) {
    try {
      const eventType = item.event_type;

      // These events are intentionally internal-only. The database state, provider
      // demand evaluator, ClickUp mirror, and CRM queue own the next action. No
      // automatic client message is generated.
      if (!["therapist_match_acceptance_requested", "therapist_first_appointment_booked"].includes(eventType)) {
        const { data, error } = await admin.rpc("record_therapist_match_outbox_result", {
          p_outbox_id: item.outbox_id,
          p_claim_token: item.claim_token,
          p_outcome: "delivered",
          p_error_code: null,
          p_error_detail: null,
          p_retry_at: null,
        });
        results.push(error ? { outboxId: item.outbox_id, error: error.message } : data);
        continue;
      }

      const { data: match, error: matchError } = await admin
        .from("client_therapist_matches")
        .select("id, tenant_id, client_id, staff_id, state, expires_at")
        .eq("id", item.aggregate_id)
        .single();
      if (matchError || !match) throw new Error(matchError?.message ?? "Match not found");

      const [{ data: client, error: clientError }, { data: staff, error: staffError }] =
        await Promise.all([
          admin
            .from("clients")
            .select("id, pat_name_f, pat_name_l, email")
            .eq("id", match.client_id)
            .single(),
          admin
            .from("staff")
            .select(`
              id,
              prov_name_f,
              prov_name_l,
              prov_name_for_clients,
              profiles!staff_profile_id_fkey (email)
            `)
            .eq("id", match.staff_id)
            .single(),
        ]);
      if (clientError || !client) throw new Error(clientError?.message ?? "Client not found");
      if (staffError || !staff) throw new Error(staffError?.message ?? "Therapist not found");

      const therapistEmail = (staff.profiles as { email?: string } | null)?.email;
      if (!therapistEmail) {
        const { data, error } = await admin.rpc("record_therapist_match_outbox_result", {
          p_outbox_id: item.outbox_id,
          p_claim_token: item.claim_token,
          p_outcome: "delivered",
          p_error_code: null,
          p_error_detail: null,
          p_retry_at: null,
        });
        results.push(error ? { outboxId: item.outbox_id, error: error.message } : data);
        continue;
      }

      const { data: tenant } = await admin
        .from("tenants")
        .select("display_name")
        .eq("id", match.tenant_id)
        .maybeSingle();

      const businessName = tenant?.display_name || "ValorWell";
      const therapistName =
        staff.prov_name_for_clients ||
        `${staff.prov_name_f || ""} ${staff.prov_name_l || ""}`.trim() ||
        "Therapist";
      const clientName =
        `${client.pat_name_f || ""} ${client.pat_name_l || ""}`.trim() ||
        "Client";

      let subject: string;
      let heading: string;
      let intro: string;
      let detailHtml = "";

      if (eventType === "therapist_match_acceptance_requested") {
        subject = `Therapist match awaiting your review: ${clientName}`;
        heading = "Therapist Match Review Required";
        intro =
          "A client selected you as their therapist. This is not yet an active therapist relationship. Review the match in the EHR and explicitly accept or decline it.";
        if (match.expires_at) {
          const deadline = new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "America/Chicago",
          }).format(new Date(match.expires_at));
          detailHtml = `<p><strong>Review deadline:</strong> ${escapeHtml(deadline)} Central</p>`;
        }
      } else {
        subject = `New client appointment scheduled: ${clientName}`;
        heading = "First Appointment Scheduled";
        intro =
          "A client selected you and booked the first appointment. The therapist relationship was activated atomically with the appointment.";
        const appointmentId = String(item.payload?.appointment_id ?? "");
        if (appointmentId) {
          const { data: appointment } = await admin
            .from("appointments")
            .select("start_at, time_zone")
            .eq("id", appointmentId)
            .maybeSingle();
          if (appointment?.start_at && appointment.time_zone) {
            const formatted = new Intl.DateTimeFormat("en-US", {
              timeZone: appointment.time_zone,
              dateStyle: "full",
              timeStyle: "short",
            }).format(new Date(appointment.start_at));
            detailHtml = `<p><strong>Appointment:</strong> ${escapeHtml(formatted)}</p>`;
          }
        }
      }

      const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;color:#1f2937;padding:24px">
  <div style="max-width:620px;margin:auto;background:white;border-radius:10px;overflow:hidden">
    <div style="background:#4f46e5;color:white;padding:24px"><h1>${escapeHtml(heading)}</h1></div>
    <div style="padding:28px">
      <p>Hello ${escapeHtml(therapistName)},</p>
      <p>${escapeHtml(intro)}</p>
      <div style="background:#eef2ff;border-left:4px solid #4f46e5;border-radius:6px;padding:16px;margin:18px 0">
        <strong>Client:</strong> ${escapeHtml(clientName)}<br>
        <strong>Email:</strong> ${escapeHtml(client.email || "Not provided")}
      </div>
      ${detailHtml}
      <p><a href="https://emr.valorwell.org" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:12px 20px;border-radius:7px;font-weight:600">Open the EHR</a></p>
    </div>
    <div style="padding:18px 28px;background:#f9fafb;color:#6b7280;font-size:12px">
      Operational notification from ${escapeHtml(businessName)}. No automatic portal message was sent to the client.
    </div>
  </div>
</body>
</html>`;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${resendApiKey}`,
          "content-type": "application/json",
          "idempotency-key": `therapist-match/${item.outbox_id}`,
          "user-agent": "ValorWell-Therapist-Match-Worker/1.0",
        },
        body: JSON.stringify({
          from: `${businessName} <noreply@valorwell.com>`,
          to: [therapistEmail],
          subject,
          html,
        }),
      });
      const provider = await response.json().catch(() => ({})) as {
        id?: string;
        message?: string;
        name?: string;
      };

      if (!response.ok || !provider.id) {
        const retryable = response.status === 429 || response.status >= 500;
        const exhausted = item.attempt_count >= 8;
        const outcome = retryable && !exhausted ? "retry" : "dead_letter";
        const retryAt =
          outcome === "retry"
            ? new Date(Date.now() + Math.min(60, 2 ** item.attempt_count) * 60_000).toISOString()
            : null;
        const { data, error } = await admin.rpc("record_therapist_match_outbox_result", {
          p_outbox_id: item.outbox_id,
          p_claim_token: item.claim_token,
          p_outcome: outcome,
          p_error_code: provider.name ?? `http_${response.status}`,
          p_error_detail: provider.message ?? "Resend rejected the notification",
          p_retry_at: retryAt,
        });
        results.push(error ? { outboxId: item.outbox_id, error: error.message } : data);
        continue;
      }

      const { data, error } = await admin.rpc("record_therapist_match_outbox_result", {
        p_outbox_id: item.outbox_id,
        p_claim_token: item.claim_token,
        p_outcome: "delivered",
        p_error_code: null,
        p_error_detail: null,
        p_retry_at: null,
      });
      results.push(error ? { outboxId: item.outbox_id, error: error.message } : data);
    } catch (error) {
      const exhausted = item.attempt_count >= 8;
      const outcome = exhausted ? "dead_letter" : "retry";
      const retryAt =
        outcome === "retry"
          ? new Date(Date.now() + Math.min(60, 2 ** item.attempt_count) * 60_000).toISOString()
          : null;
      const message = error instanceof Error ? error.message : String(error);
      const { data, error: resultError } = await admin.rpc(
        "record_therapist_match_outbox_result",
        {
          p_outbox_id: item.outbox_id,
          p_claim_token: item.claim_token,
          p_outcome: outcome,
          p_error_code: "worker_error",
          p_error_detail: message,
          p_retry_at: retryAt,
        },
      );
      results.push(resultError ? { outboxId: item.outbox_id, error: resultError.message } : data);
    }
  }

  console.log(JSON.stringify({
    component: "therapist-match-outbox-worker",
    workerId,
    claimed: (claimed ?? []).length,
  }));
  return json({ workerId, claimed: (claimed ?? []).length, results });
});
