-- Resource Platform v2: additive schema. Keeps public.website_resources as the
-- canonical registry so existing research/automation workflows remain compatible.

alter table public.website_resources
  add column if not exists content_schema_version integer not null default 1,
  add column if not exists editorial_type text not null default 'guide',
  add column if not exists featured boolean not null default false,
  add column if not exists sort_order integer not null default 100,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists public_updated_at timestamptz;

update public.website_resources
set
  editorial_type = case
    when resource_kind = 'category' then 'category'
    else coalesce(nullif(editorial_type, ''), 'guide')
  end,
  public_updated_at = coalesce(public_updated_at, published_at, updated_at)
where editorial_type is distinct from case
    when resource_kind = 'category' then 'category'
    else coalesce(nullif(editorial_type, ''), 'guide')
  end
   or public_updated_at is null;

alter table public.website_resources
  drop constraint if exists website_resources_content_schema_version_check,
  add constraint website_resources_content_schema_version_check
    check (content_schema_version between 1 and 10),
  drop constraint if exists website_resources_editorial_type_check,
  add constraint website_resources_editorial_type_check
    check (editorial_type = any (array[
      'category'::text,
      'guide'::text,
      'explainer'::text,
      'checklist'::text,
      'reference'::text
    ]));

create index if not exists website_resources_article_display_idx
  on public.website_resources
    (tenant_id, category_slug, status, featured desc, sort_order, title)
  where resource_kind = 'article';

create table if not exists public.website_resource_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  resource_id uuid not null,
  citation_key text not null,
  organization text,
  title text,
  url text not null,
  source_type text not null default 'official',
  source_published_at timestamptz,
  verified_at timestamptz,
  is_public boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_resource_sources_resource_fkey
    foreign key (tenant_id, resource_id)
    references public.website_resources (tenant_id, id)
    on delete cascade,
  constraint website_resource_sources_citation_key_not_blank
    check (btrim(citation_key) <> ''),
  constraint website_resource_sources_url_not_blank
    check (btrim(url) <> ''),
  constraint website_resource_sources_source_type_check
    check (source_type = any (array[
      'official'::text,
      'statute'::text,
      'regulation'::text,
      'policy'::text,
      'clinical'::text,
      'research'::text,
      'other'::text
    ])),
  constraint website_resource_sources_unique_url
    unique (tenant_id, resource_id, url),
  constraint website_resource_sources_unique_citation_key
    unique (tenant_id, resource_id, citation_key)
);

create index if not exists website_resource_sources_public_idx
  on public.website_resource_sources (tenant_id, resource_id, is_public, display_order);

alter table public.website_resource_sources enable row level security;

drop policy if exists website_resource_sources_public_read
  on public.website_resource_sources;
create policy website_resource_sources_public_read
  on public.website_resource_sources
  for select
  to anon, authenticated
  using (
    is_public
    and exists (
      select 1
      from public.website_resources wr
      where wr.tenant_id = website_resource_sources.tenant_id
        and wr.id = website_resource_sources.resource_id
        and wr.status = 'published'
    )
  );

grant select on public.website_resource_sources to anon, authenticated;

create table if not exists public.website_resource_relations (
  tenant_id uuid not null,
  resource_id uuid not null,
  related_resource_id uuid not null,
  relation_type text not null default 'related',
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  primary key (tenant_id, resource_id, related_resource_id, relation_type),
  constraint website_resource_relations_resource_fkey
    foreign key (tenant_id, resource_id)
    references public.website_resources (tenant_id, id)
    on delete cascade,
  constraint website_resource_relations_related_resource_fkey
    foreign key (tenant_id, related_resource_id)
    references public.website_resources (tenant_id, id)
    on delete cascade,
  constraint website_resource_relations_no_self_relation
    check (resource_id <> related_resource_id),
  constraint website_resource_relations_type_check
    check (relation_type = any (array[
      'related'::text,
      'start_here'::text,
      'next'::text,
      'previous'::text
    ]))
);

create index if not exists website_resource_relations_lookup_idx
  on public.website_resource_relations
    (tenant_id, resource_id, relation_type, display_order);

alter table public.website_resource_relations enable row level security;

drop policy if exists website_resource_relations_public_read
  on public.website_resource_relations;
create policy website_resource_relations_public_read
  on public.website_resource_relations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.website_resources source_resource
      join public.website_resources related_resource
        on related_resource.tenant_id = website_resource_relations.tenant_id
       and related_resource.id = website_resource_relations.related_resource_id
      where source_resource.tenant_id = website_resource_relations.tenant_id
        and source_resource.id = website_resource_relations.resource_id
        and source_resource.status = 'published'
        and related_resource.status = 'published'
    )
  );

grant select on public.website_resource_relations to anon, authenticated;

-- Preserve current vetted research sources as structured source records. They
-- can be enriched later with organization/title/date metadata without changing
-- the article source format.
insert into public.website_resource_sources (
  tenant_id,
  resource_id,
  citation_key,
  url,
  source_type,
  verified_at,
  is_public,
  display_order
)
select
  wr.tenant_id,
  wr.id,
  'source-' || lpad(source_row.ordinality::text, 2, '0'),
  source_row.url,
  'official',
  wr.last_researched_at,
  true,
  source_row.ordinality::integer * 10
from public.website_resources wr
cross join lateral unnest(wr.source_urls)
  with ordinality as source_row(url, ordinality)
where btrim(source_row.url) <> ''
on conflict (tenant_id, resource_id, url) do nothing;
