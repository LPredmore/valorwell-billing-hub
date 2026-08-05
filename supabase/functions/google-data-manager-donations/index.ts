const CRON_SECRET_SHA256 = "112ac8cef261bc239f93b0c3b0227ea83cdcfb5ecc665ba5043263db3f681558";
const OPERATING_ACCOUNT_ID = "6832312938";
const LOGIN_ACCOUNT_ID = "7235774362";
const CONVERSION_ACTION_ID = "7710648169";
const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
const DATA_MANAGER_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";
const DATA_MANAGER_STATUS_URL = "https://datamanager.googleapis.com/v1/requestStatus:retrieve";
const FIRST_DIAGNOSTIC_DELAY_MINUTES = 30;
const MAX_ATTEMPTS = 5;

type JsonRecord = Record<string, unknown>;

type ServiceAccount = {
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
};

type ClaimedDonation = {
  transaction_id: string;
  token: string;
  amount: number | string;
  currency: string;
  donated_at: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  attempt_count: number;
};

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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function authorized(req: Request) {
  const supplied = req.headers.get("x-cron-secret") ?? "";
  if (!supplied) return false;
  return constantTimeEqual(await sha256(supplied), CRON_SECRET_SHA256);
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(pem: string) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getAccessToken(serviceAccount: ServiceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
    ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {}),
  }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: DATA_MANAGER_SCOPE,
    aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(`Google OAuth failed (${response.status}): ${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return payload.access_token;
}

function config() {
  const raw = Deno.env.get("GOOGLE_DATAMANAGER_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_DATAMANAGER_SERVICE_ACCOUNT_JSON is not configured");
  const serviceAccount = JSON.parse(raw) as ServiceAccount;
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Google service account JSON is incomplete");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase runtime configuration is missing");
  return { serviceAccount, supabaseUrl, serviceRoleKey };
}

function restHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function chooseIdentifiers(row: ClaimedDonation) {
  const adIdentifiers: JsonRecord = {};
  if (row.gclid) adIdentifiers.gclid = row.gclid;
  if (row.gbraid) adIdentifiers.gbraid = row.gbraid;
  if (row.wbraid) adIdentifiers.wbraid = row.wbraid;
  const identifierType = row.gclid ? "gclid" : row.wbraid ? "wbraid" : row.gbraid ? "gbraid" : null;
  return { adIdentifiers, identifierType };
}

function destination() {
  return {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: OPERATING_ACCOUNT_ID },
    loginAccount: { accountType: "GOOGLE_ADS", accountId: LOGIN_ACCOUNT_ID },
    productDestinationId: CONVERSION_ACTION_ID,
  };
}

async function googleRequest(
  url: string,
  accessToken: string,
  projectId: string,
  init: RequestInit,
) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-goog-user-project": projectId,
      ...(init.headers ?? {}),
    },
  });
}

async function patchDonation(
  supabaseUrl: string,
  serviceRoleKey: string,
  transactionId: string,
  values: JsonRecord,
) {
  const url = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  url.searchParams.set("transaction_id", `eq.${transactionId}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Donation update failed (${response.status})`);
}

function retryAt(attempt: number) {
  const minutes = Math.min(60 * 24, Math.max(15, 15 * (2 ** Math.max(0, attempt - 1))));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function claimDonations(
  supabaseUrl: string,
  serviceRoleKey: string,
  limit: number,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_google_ads_donations`, {
    method: "POST",
    headers: restHeaders(serviceRoleKey),
    body: JSON.stringify({ p_limit: limit }),
  });
  if (!response.ok) {
    throw new Error(`Donation claim failed (${response.status}): ${await response.text().catch(() => "")}`);
  }
  return await response.json() as ClaimedDonation[];
}

async function ingestDonation(
  row: ClaimedDonation,
  accessToken: string,
  serviceAccount: ServiceAccount,
  validateOnly: boolean,
) {
  const { adIdentifiers, identifierType } = chooseIdentifiers(row);
  if (!identifierType) throw new Error("No Google click identifier is available");
  const amount = Number(row.amount);
  const timestamp = new Date(row.donated_at);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Donation amount is invalid");
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Donation timestamp is invalid");

  const requestBody = {
    destinations: [destination()],
    encoding: "HEX",
    validateOnly,
    events: [{
      adIdentifiers,
      conversionValue: amount,
      currency: String(row.currency ?? "USD").toUpperCase(),
      eventTimestamp: timestamp.toISOString(),
      transactionId: row.transaction_id,
      eventSource: "WEB",
    }],
  };
  const response = await googleRequest(
    DATA_MANAGER_INGEST_URL,
    accessToken,
    serviceAccount.project_id,
    { method: "POST", body: JSON.stringify(requestBody) },
  );
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  return { response, payload, identifierType };
}

async function processDiagnostics(
  supabaseUrl: string,
  serviceRoleKey: string,
  accessToken: string,
  serviceAccount: ServiceAccount,
  limit: number,
) {
  const cutoff = new Date(Date.now() - FIRST_DIAGNOSTIC_DELAY_MINUTES * 60 * 1000).toISOString();
  const url = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  url.searchParams.set("select", "transaction_id,ads_request_id,ads_attempt_count,ads_diagnostics_checked_at");
  url.searchParams.set("ads_upload_status", "eq.processing");
  url.searchParams.set("ads_request_id", "not.is.null");
  url.searchParams.set("ads_last_attempt_at", `lte.${cutoff}`);
  url.searchParams.set("order", "ads_last_attempt_at.asc");
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, { headers: restHeaders(serviceRoleKey) });
  if (!response.ok) throw new Error(`Diagnostics queue query failed (${response.status})`);
  const rows = await response.json() as Array<{
    transaction_id: string;
    ads_request_id: string;
    ads_attempt_count: number;
    ads_diagnostics_checked_at: string | null;
  }>;

  const outcomes: JsonRecord[] = [];
  for (const row of rows) {
    const statusUrl = new URL(DATA_MANAGER_STATUS_URL);
    statusUrl.searchParams.set("requestId", row.ads_request_id);
    const statusResponse = await googleRequest(
      statusUrl.toString(),
      accessToken,
      serviceAccount.project_id,
      { method: "GET" },
    );
    const payload = await statusResponse.json().catch(() => ({})) as JsonRecord;
    if (!statusResponse.ok) {
      const retryable = statusResponse.status === 429 || statusResponse.status >= 500;
      await patchDonation(supabaseUrl, serviceRoleKey, row.transaction_id, {
        ads_upload_status: retryable ? "processing" : "failed",
        ads_diagnostics_checked_at: new Date().toISOString(),
        ads_upload_error: JSON.stringify(payload).slice(0, 4000),
        ads_upload_details: payload,
      });
      outcomes.push({ transactionId: row.transaction_id, httpStatus: statusResponse.status, retryable });
      continue;
    }

    const perDestination = Array.isArray(payload.requestStatusPerDestination)
      ? payload.requestStatusPerDestination as JsonRecord[]
      : [];
    const requestStatus = String(perDestination[0]?.requestStatus ?? "PROCESSING");
    const terminal = ["SUCCESS", "FAILED", "PARTIAL_SUCCESS"].includes(requestStatus);
    await patchDonation(supabaseUrl, serviceRoleKey, row.transaction_id, {
      ads_upload_status: requestStatus === "SUCCESS"
        ? "succeeded"
        : requestStatus === "PARTIAL_SUCCESS"
        ? "partial_success"
        : requestStatus === "FAILED"
        ? "failed"
        : "processing",
      ads_diagnostics_checked_at: new Date().toISOString(),
      ads_uploaded_at: requestStatus === "SUCCESS" ? new Date().toISOString() : null,
      ads_upload_error: requestStatus === "FAILED" || requestStatus === "PARTIAL_SUCCESS"
        ? JSON.stringify(payload).slice(0, 4000)
        : null,
      ads_upload_details: payload,
      ...(terminal ? { ads_next_attempt_at: null } : {}),
    });
    outcomes.push({ transactionId: row.transaction_id, requestStatus });
  }
  return outcomes;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await authorized(req))) return json({ error: "Unauthorized" }, 401);

  let runtime;
  try {
    runtime = config();
  } catch (error) {
    return json({ configured: false, error: error instanceof Error ? error.message : String(error) }, 503);
  }

  const body = await req.json().catch(() => ({})) as JsonRecord;
  const mode = body.mode === "validate" || body.mode === "diagnostics" ? body.mode : "run";
  const limit = Math.max(1, Math.min(Number(body.limit ?? 10) || 10, 50));

  try {
    const accessToken = await getAccessToken(runtime.serviceAccount);

    if (mode === "diagnostics") {
      const diagnostics = await processDiagnostics(
        runtime.supabaseUrl,
        runtime.serviceRoleKey,
        accessToken,
        runtime.serviceAccount,
        limit,
      );
      return json({ ok: true, mode, diagnostics });
    }

    const claimed = await claimDonations(runtime.supabaseUrl, runtime.serviceRoleKey, limit);
    if (!claimed.length) {
      return json({ ok: true, mode, claimed: 0, message: "No eligible attributable donations" });
    }

    const results: JsonRecord[] = [];
    for (const row of claimed) {
      try {
        const { response, payload, identifierType } = await ingestDonation(
          row,
          accessToken,
          runtime.serviceAccount,
          mode === "validate",
        );
        if (mode === "validate") {
          await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, row.transaction_id, {
            ads_upload_status: "pending",
            ads_attempt_count: Math.max(0, Number(row.attempt_count) - 1),
            ads_last_attempt_at: null,
            ads_upload_error: response.ok ? null : JSON.stringify(payload).slice(0, 4000),
            ads_upload_details: { validateOnly: true, httpStatus: response.status, response: payload },
            ads_identifier_type: identifierType,
            ads_next_attempt_at: null,
          });
          results.push({ transactionId: row.transaction_id, valid: response.ok, httpStatus: response.status, response: payload });
          continue;
        }

        if (response.ok && typeof payload.requestId === "string") {
          await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, row.transaction_id, {
            ads_upload_status: "processing",
            ads_request_id: payload.requestId,
            ads_identifier_type: identifierType,
            ads_upload_error: null,
            ads_upload_details: { ingest: payload },
            ads_next_attempt_at: null,
          });
          results.push({ transactionId: row.transaction_id, accepted: true, requestId: payload.requestId });
        } else {
          const retryable = response.status === 429 || response.status >= 500;
          const exhausted = row.attempt_count >= MAX_ATTEMPTS;
          await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, row.transaction_id, {
            ads_upload_status: retryable && !exhausted ? "retry" : "failed",
            ads_identifier_type: identifierType,
            ads_upload_error: JSON.stringify(payload).slice(0, 4000),
            ads_upload_details: { httpStatus: response.status, response: payload },
            ads_next_attempt_at: retryable && !exhausted ? retryAt(row.attempt_count) : null,
          });
          results.push({ transactionId: row.transaction_id, accepted: false, httpStatus: response.status, retryable: retryable && !exhausted });
        }
      } catch (error) {
        const exhausted = row.attempt_count >= MAX_ATTEMPTS;
        const message = error instanceof Error ? error.message : String(error);
        await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, row.transaction_id, {
          ads_upload_status: exhausted ? "failed" : "retry",
          ads_upload_error: message.slice(0, 4000),
          ads_upload_details: { exception: message },
          ads_next_attempt_at: exhausted ? null : retryAt(row.attempt_count),
        });
        results.push({ transactionId: row.transaction_id, accepted: false, exception: message });
      }
    }

    const diagnostics = mode === "run"
      ? await processDiagnostics(
        runtime.supabaseUrl,
        runtime.serviceRoleKey,
        accessToken,
        runtime.serviceAccount,
        limit,
      )
      : [];

    return json({ ok: true, mode, claimed: claimed.length, results, diagnostics });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
