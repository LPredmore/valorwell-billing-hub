-- FINAL Resource Platform v2 public cutover.
-- Apply ONLY AFTER the production website is running the release that reads
-- public.website_resources_public instead of public.website_resources.

revoke select on public.website_resources from anon, authenticated;
