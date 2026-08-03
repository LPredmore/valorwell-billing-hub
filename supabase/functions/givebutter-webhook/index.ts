function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function extractGbToken(value: string): string | null {
  return value.match(/gbtoken:([0-9a-fA-F-]{36})/)?.[1] ?? null;
}

function extractRefFromUrl(value: unknown): string | null {
  try {
    return typeof value === "string" && value ? new URL(value).searchParams.get("ref") : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: "Server configuration missing" }, 500);

  const raw = await req.json().catch(() => null);
  if (!raw) return json({ ok: false, error: "Invalid JSON payload" }, 400);

  const eventType = String(raw.event ?? raw.type ?? raw.name ?? raw.event_type ?? "unknown");
  const tx = raw?.data?.transaction ?? raw?.transaction ?? raw?.data ?? raw;
  const transactionId = tx?.id ?? tx?.transaction_id ?? tx?.payment_id ?? tx?.charge_id ?? null;
  if (!transactionId) {
    console.error("Givebutter webhook missing transaction ID", { eventType, keys: Object.keys(raw ?? {}) });
    return json({ ok: false, error: "Missing transaction_id", eventType }, 200);
  }

  const amount = Number(tx?.amount ?? tx?.amount_total ?? tx?.total ?? tx?.value ?? tx?.donation_amount ?? tx?.gross_amount ?? 0);
  const currency = String(tx?.currency ?? raw?.currency ?? "USD");
  const donatedAtRaw = tx?.transacted_at ?? tx?.created_at ?? tx?.createdAt ?? tx?.timestamp ?? raw?.created_at ?? raw?.createdAt ?? new Date().toISOString();
  const donatedAt = new Date(donatedAtRaw).toISOString();

  const utmParams = tx?.utm_parameters ?? tx?.utmParameters ?? raw?.utm_parameters ?? raw?.utmParameters ?? {};
  const utmContent = typeof utmParams?.utm_content === "string"
    ? utmParams.utm_content
    : (typeof utmParams?.utmContent === "string" ? utmParams.utmContent : "");
  const tokenFromUtm = extractGbToken(utmContent);
  const token = tokenFromUtm ?? tx?.ref ?? tx?.reference ?? tx?.metadata?.ref ?? tx?.metadata?.reference ?? tx?.metadata?.token ?? raw?.ref ?? raw?.token ?? extractRefFromUrl(tx?.landing_url ?? tx?.page_url ?? raw?.landing_url ?? raw?.page_url) ?? null;

  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/givebutter_donations?on_conflict=transaction_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      transaction_id: String(transactionId),
      token: token ? String(token) : null,
      amount,
      currency,
      donated_at: donatedAt,
      raw,
      ads_upload_status: "pending",
    }),
  });

  if (!upsertRes.ok) {
    console.error("Givebutter donation upsert failed", upsertRes.status, await upsertRes.text().catch(() => ""));
    return json({ ok: false, error: "DB upsert failed" }, 200);
  }

  return json({
    ok: true,
    eventType,
    transaction_id: String(transactionId),
    token: token ? String(token) : null,
    token_source: tokenFromUtm ? "utm_content" : (token ? "fallback" : "none"),
  });
});
