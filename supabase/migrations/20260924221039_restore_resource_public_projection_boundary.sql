-- Restore the intended public resource boundary after the website temporarily
-- regained direct SELECT access to public.website_resources.
--
-- Public website consumers read the safe published projection only.
revoke select on table public.website_resources from anon, authenticated;
grant select on table public.website_resources_public to anon, authenticated;
