-- Correct the one legacy category row that stored escaped "\n" text
-- instead of real Markdown line breaks. The update is idempotent.

update public.website_resources
set
  body_markdown = replace(body_markdown, E'\\n', E'\n'),
  updated_at = now(),
  public_updated_at = now()
where tenant_id='00000000-0000-0000-0000-000000000001'::uuid
  and slug='military-health-benefits'
  and resource_kind='category'
  and strpos(body_markdown, E'\\n') > 0;
