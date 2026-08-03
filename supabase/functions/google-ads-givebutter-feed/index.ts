type DonationRow = {
  transaction_id: string;
  token: string | null;
  amount: number | string | null;
  currency: string | null;
  donated_at: string | null;
};

function csvResponse(csv: string) {
  return new Response(csv, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function header() {
  return "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID\n";
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
}

function line(fields: string[]) {
  return fields.map((field) => escapeCsv(String(field ?? ""))).join(",");
}

function checkBasicAuth(req: Request, user: string, pass: string) {
  if (!user || !pass) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    const split = decoded.indexOf(":");
    return split >= 0 && decoded.slice(0, split) === user && decoded.slice(split + 1) === pass;
  } catch {
    return false;
  }
}

function quoteIn(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toAdsTimeUTC(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

Deno.serve(async (req) => {
  const feedUser = Deno.env.get("ADS_FEED_USER") ?? "";
  const feedPass = Deno.env.get("ADS_FEED_PASS") ?? "";
  if (!checkBasicAuth(req, feedUser, feedPass)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="google-ads-feed"' } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return new Response("Server configuration missing", { status: 500 });

  const minimumAgeHours = Number(Deno.env.get("ADS_FEED_MIN_AGE_HOURS") ?? "6");
  const donationUrl = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
  donationUrl.searchParams.set("select", "transaction_id,token,amount,currency,donated_at");
  donationUrl.searchParams.append("token", "not.is.null");
  donationUrl.searchParams.append("donated_at", "not.is.null");
  donationUrl.searchParams.append("amount", "not.is.null");
  donationUrl.searchParams.append("ads_exported_at", "is.null");
  donationUrl.searchParams.append("ads_upload_status", "eq.pending");
  donationUrl.searchParams.set("limit", "5000");

  const donationResponse = await fetch(donationUrl, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!donationResponse.ok) return new Response("Donation query failed", { status: 500 });
  const donations: DonationRow[] = await donationResponse.json();
  if (!donations.length) return csvResponse(header());

  const tokens = [...new Set(donations.map((row) => row.token).filter(Boolean) as string[])];
  const attributionUrl = new URL(`${supabaseUrl}/rest/v1/donation_attribution`);
  attributionUrl.searchParams.set("select", "token,gclid");
  attributionUrl.searchParams.set("token", `in.(${tokens.map(quoteIn).join(",")})`);
  attributionUrl.searchParams.append("gclid", "not.is.null");
  attributionUrl.searchParams.set("limit", "5000");
  const attributionResponse = await fetch(attributionUrl, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const attributionRows = attributionResponse.ok ? await attributionResponse.json() : [];
  const gclidByToken = new Map<string, string>();
  for (const row of attributionRows) {
    if (row.token && row.gclid) gclidByToken.set(String(row.token), String(row.gclid));
  }

  const lines = [header().trimEnd()];
  const exportedIds: string[] = [];
  const minAgeMs = minimumAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  for (const donation of donations) {
    if (!donation.token || !donation.donated_at) continue;
    const gclid = gclidByToken.get(donation.token);
    if (!gclid) continue;
    const timestamp = Date.parse(donation.donated_at);
    if (!Number.isFinite(timestamp) || now - timestamp < minAgeMs) continue;
    const amount = Number(donation.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    lines.push(line([
      gclid,
      "GiveButter",
      toAdsTimeUTC(donation.donated_at),
      amount.toFixed(2),
      String(donation.currency ?? "USD").toUpperCase(),
      donation.transaction_id,
    ]));
    exportedIds.push(donation.transaction_id);
  }

  if (exportedIds.length) {
    const updateUrl = new URL(`${supabaseUrl}/rest/v1/givebutter_donations`);
    updateUrl.searchParams.set("transaction_id", `in.(${exportedIds.map(quoteIn).join(",")})`);
    await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ads_exported_at: new Date().toISOString(), ads_upload_status: "exported" }),
    });
  }

  return csvResponse(lines.join("\n") + "\n");
});
