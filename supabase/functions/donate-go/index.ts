const GIVEBUTTER_CAMPAIGN_URL = "https://givebutter.com/valorwellhelp";
const ALLOWED_ORIGINS = new Set([
  "https://valorwell.org",
  "https://www.valorwell.org",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function requestOrigin(req: Request) {
  return req.headers.get("origin") ?? "";
}

function corsHeaders(req: Request) {
  const origin = requestOrigin(req);
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://valorwell.org",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function rowValue(row: JsonRecord, key: string): string | null {
  return clean(
    row[key],
    key === "landing_path" || key === "referrer"
      ? 2048
      : key.includes("content") || key === "utm_term"
        ? 512
        : 256,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = requestOrigin(req);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const origin = requestOrigin(req);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Origin not allowed" }, 403);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32768) {
    return json(req, { error: "Request too large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "Server configuration missing" }, 500);

  const body = await req.json().catch(() => null) as JsonRecord | null;
  if (!body || Array.isArray(body)) return json(req, { error: "Invalid JSON payload" }, 400);

  const requestedHandoffId = clean(body.handoff_id, 64);
  const token = requestedHandoffId && UUID_RE.test(requestedHandoffId)
    ? requestedHandoffId.toLowerCase()
    : crypto.randomUUID();

  const row = {
    token,
    gclid: clean(body.gclid, 256),
    gbraid: clean(body.gbraid, 256),
    wbraid: clean(body.wbraid, 256),
    utm_source: clean(body.utm_source, 256),
    utm_medium: clean(body.utm_medium, 256),
    utm_campaign: clean(body.utm_campaign, 256),
    utm_term: clean(body.utm_term, 512),
    utm_content: clean(body.utm_content, 512),
    landing_path: clean(body.landing_path, 2048),
    referrer: clean(body.referrer, 2048),
    entry_cta_source: clean(body.entry_cta_source, 256),
    entry_cta_campaign: clean(body.entry_cta_campaign, 256),
    entry_cta_content: clean(body.entry_cta_content, 512),
    checkout_cta_source: clean(body.checkout_cta_source, 256),
    checkout_cta_campaign: clean(body.checkout_cta_campaign, 256),
    checkout_cta_content: clean(body.checkout_cta_content, 512),
    client_captured_at: clean(body.client_captured_at, 64),
    updated_at: new Date().toISOString(),
  };

  const insertUrl = new URL(`${supabaseUrl}/rest/v1/donation_attribution`);
  insertUrl.searchParams.set("on_conflict", "token");
  const insertRes = await fetch(insertUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!insertRes.ok) {
    console.error("Donation attribution insert failed", insertRes.status, await insertRes.text().catch(() => ""));
    return json(req, { error: "Attribution handoff failed" }, 500);
  }

  const selectUrl = new URL(`${supabaseUrl}/rest/v1/donation_attribution`);
  selectUrl.searchParams.set("select", "utm_source,utm_medium,utm_campaign,utm_term,utm_content,checkout_cta_source");
  selectUrl.searchParams.set("token", `eq.${token}`);
  selectUrl.searchParams.set("limit", "1");
  const selectRes = await fetch(selectUrl, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const storedRows = selectRes.ok ? await selectRes.json().catch(() => []) : [];
  const stored = (Array.isArray(storedRows) && storedRows[0] ? storedRows[0] : row) as JsonRecord;

  const markerParts = [`gbtoken:${token}`];
  const checkoutSource = rowValue(stored, "checkout_cta_source");
  if (checkoutSource) markerParts.push(`vwcta:${checkoutSource}`);
  const originalContent = rowValue(stored, "utm_content");
  const marker = markerParts.join("|");
  const forwardedContent = originalContent ? `${originalContent}|${marker}`.slice(0, 900) : marker;

  const qs = new URLSearchParams();
  qs.set("utm_source", rowValue(stored, "utm_source") ?? "valorwell");
  qs.set("utm_medium", rowValue(stored, "utm_medium") ?? "website");
  qs.set("utm_campaign", rowValue(stored, "utm_campaign") ?? "donation");
  const utmTerm = rowValue(stored, "utm_term");
  if (utmTerm) qs.set("utm_term", utmTerm);
  qs.set("utm_content", forwardedContent);
  qs.set("ref", token);

  return json(req, {
    token,
    redirect_url: `${GIVEBUTTER_CAMPAIGN_URL}?${qs.toString()}`,
  });
});
