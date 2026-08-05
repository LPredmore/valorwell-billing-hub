const CRON_SECRET_SHA256 = "112ac8cef261bc239f93b0c3b0227ea83cdcfb5ecc665ba5043263db3f681558";
const OPERATING_ACCOUNT_ID = "6832312938";
const LOGIN_ACCOUNT_ID = "7235774362";
const CONVERSION_ACTION_ID = "7710648169";
const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
const INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";
const STATUS_URL = "https://datamanager.googleapis.com/v1/requestStatus:retrieve";
const MAX_ATTEMPTS = 5;
const DIAGNOSTIC_DELAY_MINUTES = 30;

type JsonObject = Record<string, unknown>;

type ServiceAccount = {
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
};

type Donation = {
  transaction_id: string;
  token: string;
  amount: number | string;
  currency: string | null;
  donated_at: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  attempt_count: number;
};

function response(body: unknown, status = 200) {
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

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

async function authorized(request: Request) {
  const supplied = request.headers.get("x-cron-secret") ?? "";
  return supplied.length > 0 && constantTimeEqual(await sha256(supplied), CRON_SECRET_SHA256);
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyBytes(pem: string) {
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function loadRuntime() {
  const serviceAccountJson = Deno.env.get("GOOGLE_DATAMANAGER_SERVICE_ACCOUNT_JSON");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceAccountJson) throw new Error("GOOGLE_DATAMANAGER_SERVICE_ACCOUNT_JSON is not configured");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase runtime configuration is missing");

  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Google service account JSON is incomplete");
  }
  return { serviceAccount, supabaseUrl, serviceRoleKey };
}

async function googleAccessToken(serviceAccount: ServiceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenUri = serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
    ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {}),
  }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: DATA_MANAGER_SCOPE,
    aud: tokenUri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedJwt = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  ));
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;

  const tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await tokenResponse.json().catch(() => ({})) as JsonObject;
  if (!tokenResponse.ok || typeof payload.access_token !== "string") {
    throw new Error(`Google OAuth failed (${tokenResponse.status}): ${JSON.stringify(payload).slice(0, 1500)}`);
  }
  return payload.access_token;
}

function supabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function destination() {
  return {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: OPERATING_ACCOUNT_ID },
    loginAccount: { accountType: "GOOGLE_ADS", accountId: LOGIN_ACCOUNT_ID },
    productDestinationId: CONVERSION_ACTION_ID,
  };
}

function clickIdentifier(donation: Donation) {
  if (donation.gclid) return { adIdentifiers: { gclid: donation.gclid }, type: "gclid" };
  if (donation.wbraid) return { adIdentifiers: { wbraid: donation.wbraid }, type: "wbraid" };
  if (donation.gbraid) return { adIdentifiers: { gbraid: donation.gbraid }, type: "gbraid" };
  throw new Error("No Google click identifier is available");
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
  values: JsonObject,
) {
  const url = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  url.searchParams.set("transaction_id", `eq.${transactionId}`);
  const patchResponse = await fetch(url, {
    method: "PATCH",
    headers: { ...supabaseHeaders(serviceRoleKey), Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
  if (!patchResponse.ok) {
    throw new Error(`Donation state update failed (${patchResponse.status})`);
  }
}

async function claimDonations(
  supabaseUrl: string,
  serviceRoleKey: string,
  limit: number,
) {
  const claimResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_google_ads_donations`, {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey),
    body: JSON.stringify({ p_limit: limit }),
  });
  if (!claimResponse.ok) {
    throw new Error(`Donation claim failed (${claimResponse.status}): ${await claimResponse.text().catch(() => "")}`);
  }
  return await claimResponse.json() as Donation[];
}

function nextRetry(attempt: number) {
  const minutes = Math.min(1440, 15 * (2 ** Math.max(0, attempt - 1)));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function ingest(
  donation: Donation,
  accessToken: string,
  serviceAccount: ServiceAccount,
  validateOnly: boolean,
) {
  const identifier = clickIdentifier(donation);
  const amount = Number(donation.amount);
  const donatedAt = new Date(donation.donated_at);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Donation amount is invalid");
  if (!Number.isFinite(donatedAt.getTime())) throw new Error("Donation timestamp is invalid");

  const body = {
    destinations: [destination()],
    validateOnly,
    events: [{
      adIdentifiers: identifier.adIdentifiers,
      conversionValue: amount,
      currency: String(donation.currency ?? "USD").toUpperCase(),
      eventTimestamp: donatedAt.toISOString(),
      transactionId: donation.transaction_id,
      eventSource: "WEB",
    }],
  };
  const ingestResponse = await googleRequest(
    INGEST_URL,
    accessToken,
    serviceAccount.project_id,
    { method: "POST", body: JSON.stringify(body) },
  );
  const payload = await ingestResponse.json().catch(() => ({})) as JsonObject;
  return { ingestResponse, payload, identifierType: identifier.type };
}

async function diagnostics(
  supabaseUrl: string,
  serviceRoleKey: string,
  accessToken: string,
  serviceAccount: ServiceAccount,
  limit: number,
) {
  const cutoff = new Date(Date.now() - DIAGNOSTIC_DELAY_MINUTES * 60 * 1000).toISOString();
  const queueUrl = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  queueUrl.searchParams.set("select", "transaction_id,ads_request_id,ads_attempt_count");
  queueUrl.searchParams.set("ads_upload_status", "eq.processing");
  queueUrl.searchParams.set("ads_request_id", "not.is.null");
  queueUrl.searchParams.set("ads_last_attempt_at", `lte.${cutoff}`);
  queueUrl.searchParams.set("order", "ads_last_attempt_at.asc");
  queueUrl.searchParams.set("limit", String(limit));

  const queueResponse = await fetch(queueUrl, { headers: supabaseHeaders(serviceRoleKey) });
  if (!queueResponse.ok) throw new Error(`Diagnostics queue failed (${queueResponse.status})`);
  const rows = await queueResponse.json() as Array<{
    transaction_id: string;
    ads_request_id: string;
    ads_attempt_count: number;
  }>;

  const results: JsonObject[] = [];
  for (const row of rows) {
    const statusUrl = new URL(STATUS_URL);
    statusUrl.searchParams.set("requestId", row.ads_request_id);
    const statusResponse = await googleRequest(
      statusUrl.toString(),
      accessToken,
      serviceAccount.project_id,
      { method: "GET" },
    );
    const payload = await statusResponse.json().catch(() => ({})) as JsonObject;
    const perDestination = Array.isArray(payload.requestStatusPerDestination)
      ? payload.requestStatusPerDestination as JsonObject[]
      : [];
    const requestStatus = String(perDestination[0]?.requestStatus ?? "PROCESSING");

    if (!statusResponse.ok) {
      const transient = statusResponse.status === 429 || statusResponse.status >= 500;
      await patchDonation(supabaseUrl, serviceRoleKey, row.transaction_id, {
        ads_upload_status: transient ? "processing" : "failed",
        ads_diagnostics_checked_at: new Date().toISOString(),
        ads_upload_error: JSON.stringify(payload).slice(0, 4000),
        ads_upload_details: payload,
      });
      results.push({ transactionId: row.transaction_id, httpStatus: statusResponse.status, transient });
      continue;
    }

    const succeeded = requestStatus === "SUCCESS";
    const partial = requestStatus === "PARTIAL_SUCCESS";
    const failed = requestStatus === "FAILED";
    await patchDonation(supabaseUrl, serviceRoleKey, row.transaction_id, {
      ads_upload_status: succeeded ? "succeeded" : partial ? "partial_success" : failed ? "failed" : "processing",
      ads_diagnostics_checked_at: new Date().toISOString(),
      ads_uploaded_at: succeeded ? new Date().toISOString() : null,
      ads_upload_error: partial || failed ? JSON.stringify(payload).slice(0, 4000) : null,
      ads_upload_details: payload,
    });
    results.push({ transactionId: row.transaction_id, requestStatus });
  }
  return results;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  if (!(await authorized(request))) return response({ error: "Unauthorized" }, 401);

  let runtime: ReturnType<typeof loadRuntime>;
  try {
    runtime = loadRuntime();
  } catch (error) {
    return response({ configured: false, error: error instanceof Error ? error.message : String(error) }, 503);
  }

  const input = await request.json().catch(() => ({})) as JsonObject;
  const mode = input.mode === "validate" || input.mode === "diagnostics" ? input.mode : "run";
  const limit = Math.max(1, Math.min(Number(input.limit ?? 10) || 10, 50));

  try {
    const accessToken = await googleAccessToken(runtime.serviceAccount);
    if (mode === "diagnostics") {
      return response({
        ok: true,
        mode,
        results: await diagnostics(
          runtime.supabaseUrl,
          runtime.serviceRoleKey,
          accessToken,
          runtime.serviceAccount,
          limit,
        ),
      });
    }

    const donations = await claimDonations(runtime.supabaseUrl, runtime.serviceRoleKey, limit);
    if (donations.length === 0) {
      return response({ ok: true, mode, claimed: 0, message: "No eligible attributable donations" });
    }

    const results: JsonObject[] = [];
    for (const donation of donations) {
      try {
        const { ingestResponse, payload, identifierType } = await ingest(
          donation,
          accessToken,
          runtime.serviceAccount,
          mode === "validate",
        );

        if (mode === "validate") {
          await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, donation.transaction_id, {
            ads_upload_status: "pending",
            ads_attempt_count: Math.max(0, Number(donation.attempt_count) - 1),
            ads_last_attempt_at: null,
            ads_next_attempt_at: null,
            ads_identifier_type: identifierType,
            ads_upload_error: ingestResponse.ok ? null : JSON.stringify(payload).slice(0, 4000),
            ads_upload_details: { validateOnly: true, httpStatus: ingestResponse.status, response: payload },
          });
          results.push({
            transactionId: donation.transaction_id,
            valid: ingestResponse.ok,
            httpStatus: ingestResponse.status,
            response: payload,
          });
          continue;
        }

        if (ingestResponse.ok && typeof payload.requestId === "string") {
          await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, donation.transaction_id, {
            ads_upload_status: "processing",
            ads_request_id: payload.requestId,
            ads_identifier_type: identifierType,
            ads_upload_error: null,
            ads_upload_details: { ingest: payload },
            ads_next_attempt_at: null,
          });
          results.push({ transactionId: donation.transaction_id, accepted: true, requestId: payload.requestId });
          continue;
        }

        const transient = ingestResponse.status === 429 || ingestResponse.status >= 500;
        const exhausted = Number(donation.attempt_count) >= MAX_ATTEMPTS;
        await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, donation.transaction_id, {
          ads_upload_status: transient && !exhausted ? "retry" : "failed",
          ads_identifier_type: identifierType,
          ads_upload_error: JSON.stringify(payload).slice(0, 4000),
          ads_upload_details: { httpStatus: ingestResponse.status, response: payload },
          ads_next_attempt_at: transient && !exhausted ? nextRetry(Number(donation.attempt_count)) : null,
        });
        results.push({
          transactionId: donation.transaction_id,
          accepted: false,
          httpStatus: ingestResponse.status,
          retryable: transient && !exhausted,
          response: payload,
        });
      } catch (error) {
        const exhausted = Number(donation.attempt_count) >= MAX_ATTEMPTS;
        const message = error instanceof Error ? error.message : String(error);
        await patchDonation(runtime.supabaseUrl, runtime.serviceRoleKey, donation.transaction_id, {
          ads_upload_status: exhausted ? "failed" : "retry",
          ads_upload_error: message.slice(0, 4000),
          ads_upload_details: { exception: message },
          ads_next_attempt_at: exhausted ? null : nextRetry(Number(donation.attempt_count)),
        });
        results.push({ transactionId: donation.transaction_id, accepted: false, exception: message });
      }
    }

    return response({ ok: true, mode, claimed: donations.length, results });
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
