-- Resource Platform v2 hardening.
-- This migration must be coordinated with the website release that switches
-- public reads from website_resources to website_resources_public.

create or replace function public.is_public_website_resource(
  p_tenant_id uuid,
  p_resource_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.website_resources wr
    where wr.tenant_id = p_tenant_id
      and wr.id = p_resource_id
      and wr.status = 'published'
  );
$$;

revoke all on function public.is_public_website_resource(uuid, uuid) from public;
grant execute on function public.is_public_website_resource(uuid, uuid)
  to anon, authenticated;

drop view if exists public.website_resources_public;

create view public.website_resources_public
with (security_barrier = true)
as
select
  wr.id,
  wr.tenant_id,
  wr.slug,
  wr.title,
  wr.primary_question,
  wr.summary,
  wr.body_markdown,
  wr.faq,
  wr.audience_tags,
  wr.topic_aliases,
  wr.status,
  wr.published_at,
  wr.resource_kind,
  wr.category_slug,
  wr.content_schema_version,
  wr.editorial_type,
  wr.featured,
  wr.sort_order,
  wr.seo_title,
  wr.seo_description,
  wr.public_updated_at
from public.website_resources wr
where wr.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  and wr.status = 'published';

revoke all on public.website_resources_public from public;
revoke all on public.website_resources_public from anon, authenticated;
grant select on public.website_resources_public to anon, authenticated;

-- Once the website has switched to the public-safe projection, anonymous and
-- authenticated clients no longer need direct access to internal research
-- fields on the canonical table.
revoke select on public.website_resources from anon, authenticated;

drop policy if exists website_resource_sources_public_read
  on public.website_resource_sources;
create policy website_resource_sources_public_read
  on public.website_resource_sources
  for select
  to anon, authenticated
  using (
    is_public
    and public.is_public_website_resource(tenant_id, resource_id)
  );

drop policy if exists website_resource_relations_public_read
  on public.website_resource_relations;
create policy website_resource_relations_public_read
  on public.website_resource_relations
  for select
  to anon, authenticated
  using (
    public.is_public_website_resource(tenant_id, resource_id)
    and public.is_public_website_resource(tenant_id, related_resource_id)
  );
