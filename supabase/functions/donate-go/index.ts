const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration missing" }, 500);

  const body = await req.json().catch(() => ({}));
  const token = crypto.randomUUID();
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/donation_attribution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      token,
      gclid: body.gclid ?? null,
      gbraid: body.gbraid ?? null,
      wbraid: body.wbraid ?? null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_term: body.utm_term ?? null,
      utm_content: body.utm_content ?? null,
    }),
  });
  if (!insertRes.ok) return json({ error: "Attribution insert failed" }, 500);

  const marker = `gbtoken:${token}`;
  const incomingContent = String(body.utm_content ?? "");
  const qs = new URLSearchParams();
  qs.set("utm_source", String(body.utm_source ?? "valorwell"));
  qs.set("utm_medium", String(body.utm_medium ?? "web"));
  qs.set("utm_campaign", String(body.utm_campaign ?? "donation"));
  if (body.utm_term) qs.set("utm_term", String(body.utm_term));
  qs.set("utm_content", incomingContent ? `${incomingContent}|${marker}` : marker);
  qs.set("ref", token);

  return json({ token, redirect_url: `https://givebutter.com/valorwellhelp?${qs.toString()}` });
});
