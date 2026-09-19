-- Immediate hardening for the existing public resource projection.
-- Keep SELECT available for the website, but remove mutation privileges from
-- anonymous and authenticated clients.
revoke all on public.website_resources_public from anon, authenticated;
grant select on public.website_resources_public to anon, authenticated;
