const EXPECTED_SECRET_SHA256 = "9257aaec44d71b82a8b6d459f622fa449ead032f2b88c5b8429822ed8eb6a94d";
const EXPECTED_CAMPAIGN_ID = "565036";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function extractGbToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.match(/(?:^|\|)gbtoken:([0-9a-f-]{36})(?:\||$)/i)?.[1] ?? null;
  return token && UUID_RE.test(token) ? token.toLowerCase() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const requestUrl = new URL(req.url);
  const suppliedSecret = requestUrl.searchParams.get("key") ?? req.headers.get("x-valorwell-webhook-key") ?? "";
  const suppliedHash = suppliedSecret ? await sha256(suppliedSecret) : "";
  if (!suppliedHash || !constantTimeEqual(suppliedHash, EXPECTED_SECRET_SHA256)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return json({ error: "Request too large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration missing" }, 500);

  const raw = await req.json().catch(() => null) as JsonRecord | null;
  if (!raw || Array.isArray(raw)) return json({ error: "Invalid JSON payload" }, 400);

  const eventType = clean(raw.event ?? raw.type ?? raw.name ?? raw.event_type, 128) ?? "unknown";
  if (eventType !== "transaction.succeeded") {
    return json({ ok: true, ignored: true, event: eventType });
  }

  const tx = ((raw.data as JsonRecord | undefined)?.transaction ?? raw.transaction ?? raw.data ?? raw) as JsonRecord;
  const campaignId = clean(tx.campaign_id ?? tx.campaignId, 64);
  if (campaignId !== EXPECTED_CAMPAIGN_ID) {
    console.warn("Ignored Givebutter transaction for unexpected campaign", { campaignId, eventType });
    return json({ ok: true, ignored: true, reason: "unexpected_campaign" });
  }

  const transactionId = clean(tx.id ?? tx.transaction_id ?? tx.payment_id ?? tx.charge_id, 128);
  if (!transactionId) return json({ error: "Missing transaction ID" }, 422);

  const amount = Number(tx.amount ?? tx.amount_total ?? tx.total ?? tx.value ?? tx.donation_amount ?? tx.gross_amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Invalid amount" }, 422);

  const currency = (clean(tx.currency ?? raw.currency, 3) ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return json({ error: "Invalid currency" }, 422);

  const donatedAtRaw = clean(
    tx.transacted_at ?? tx.created_at ?? tx.createdAt ?? tx.timestamp ?? raw.created_at ?? raw.createdAt,
    64,
  );
  const donatedAtDate = donatedAtRaw ? new Date(donatedAtRaw) : new Date();
  if (!Number.isFinite(donatedAtDate.getTime())) return json({ error: "Invalid transaction timestamp" }, 422);
  const donatedAt = donatedAtDate.toISOString();

  const utmParams = (tx.utm_parameters ?? tx.utmParameters ?? raw.utm_parameters ?? raw.utmParameters ?? {}) as JsonRecord;
  const token = extractGbToken(utmParams.utm_content ?? utmParams.utmContent);

  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const existingUrl = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  existingUrl.searchParams.set("select", "transaction_id,token");
  existingUrl.searchParams.set("transaction_id", `eq.${transactionId}`);
  existingUrl.searchParams.set("limit", "1");
  const existingRes = await fetch(existingUrl, { headers });
  const existingRows = existingRes.ok ? await existingRes.json().catch(() => []) : [];
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;

  let writeRes: Response;
  if (existing) {
    const updateUrl = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
    updateUrl.searchParams.set("transaction_id", `eq.${transactionId}`);
    writeRes = await fetch(updateUrl, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        token: existing.token ?? token,
        amount,
        currency,
        donated_at: donatedAt,
        raw,
      }),
    });
  } else {
    writeRes = await fetch(`${supabaseUrl}/rest/v1/givebutter_donations`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        transaction_id: transactionId,
        token,
        amount,
        currency,
        donated_at: donatedAt,
        raw,
        ads_upload_status: "pending",
      }),
    });
  }

  if (!writeRes.ok) {
    console.error("Givebutter transaction write failed", writeRes.status, await writeRes.text().catch(() => ""));
    return json({ error: "Donation storage failed" }, 500);
  }

  return json({ ok: true, transaction_id: transactionId, attributed: Boolean(token) });
});
