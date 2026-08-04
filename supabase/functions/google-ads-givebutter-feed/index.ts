const EXPECTED_USER_SHA256 = "1b1777f65aa4eee57c76d02e4abb51db5fa5985161d27242c7adc2683e33a44e";
const EXPECTED_PASS_SHA256 = "c57b3b725ca30e503aefd8548ae79ee6c73baa2af13178e50e973daa71be0fbb";
const CONVERSION_NAME = "Givebutter Donation";
const MAX_CLICK_AGE_DAYS = 90;
const MINIMUM_AGE_HOURS = 6;

type DonationRow = {
  transaction_id: string;
  token: string | null;
  amount: number | string | null;
  currency: string | null;
  donated_at: string | null;
};

type AttributionRow = {
  token: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
};

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

async function authorized(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    const split = decoded.indexOf(":");
    if (split < 1) return false;
    const userHash = await sha256(decoded.slice(0, split));
    const passHash = await sha256(decoded.slice(split + 1));
    return constantTimeEqual(userHash, EXPECTED_USER_SHA256) &&
      constantTimeEqual(passHash, EXPECTED_PASS_SHA256);
  } catch {
    return false;
  }
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /[",\r\n]/.test(value) ? `"${escaped}"` : escaped;
}

function csvLine(fields: Array<string | number>) {
  return fields.map((value) => escapeCsv(String(value ?? ""))).join(",");
}

function toGoogleAdsTime(value: string) {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+0000`;
}

function quoteIn(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvResponse(lines: string[]) {
  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": "inline; filename=valorwell-givebutter-conversions.csv",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!(await authorized(req))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="valorwell-google-ads-feed"',
        "Cache-Control": "no-store",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return new Response("Server configuration missing", { status: 500 });

  const cutoff = new Date(Date.now() - MAX_CLICK_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const donationUrl = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  donationUrl.searchParams.set("select", "transaction_id,token,amount,currency,donated_at");
  donationUrl.searchParams.append("token", "not.is.null");
  donationUrl.searchParams.append("donated_at", `gte.${cutoff}`);
  donationUrl.searchParams.set("order", "donated_at.asc");
  donationUrl.searchParams.set("limit", "5000");

  const authHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const donationRes = await fetch(donationUrl, { headers: authHeaders });
  if (!donationRes.ok) {
    console.error("Donation feed query failed", donationRes.status, await donationRes.text().catch(() => ""));
    return new Response("Donation query failed", { status: 500 });
  }
  const donations = await donationRes.json() as DonationRow[];

  const lines = [
    "Parameters:TimeZone=+0000",
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID",
  ];
  if (!donations.length) return csvResponse(lines);

  const tokens = [...new Set(donations.map((row) => row.token).filter(Boolean) as string[])];
  const attributionUrl = new URL(`${supabaseUrl}/rest/v1/donation_attribution`);
  attributionUrl.searchParams.set("select", "token,gclid,gbraid,wbraid");
  attributionUrl.searchParams.set("token", `in.(${tokens.map(quoteIn).join(",")})`);
  attributionUrl.searchParams.set("limit", "5000");
  const attributionRes = await fetch(attributionUrl, { headers: authHeaders });
  if (!attributionRes.ok) {
    console.error("Attribution feed query failed", attributionRes.status, await attributionRes.text().catch(() => ""));
    return new Response("Attribution query failed", { status: 500 });
  }
  const attributions = await attributionRes.json() as AttributionRow[];
  const attributionByToken = new Map(attributions.map((row) => [row.token, row]));

  const now = Date.now();
  const minAgeMs = MINIMUM_AGE_HOURS * 60 * 60 * 1000;
  for (const donation of donations) {
    if (!donation.token || !donation.donated_at) continue;
    const attribution = attributionByToken.get(donation.token);
    if (!attribution?.gclid) continue;

    const timestamp = Date.parse(donation.donated_at);
    const amount = Number(donation.amount);
    if (!Number.isFinite(timestamp) || now - timestamp < minAgeMs) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    lines.push(csvLine([
      attribution.gclid,
      CONVERSION_NAME,
      toGoogleAdsTime(donation.donated_at),
      amount.toFixed(2),
      String(donation.currency ?? "USD").toUpperCase(),
      donation.transaction_id,
    ]));
  }

  return csvResponse(lines);
});
