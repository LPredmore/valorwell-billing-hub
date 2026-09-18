-- Seed an intentional starting order for the current published resource library.
update public.website_resources
set
  featured = slug in (
    'mental-health-provider-access',
    'understanding-treatment-records',
    'military-separation-limited-communication',
    'tricare-other-health-insurance',
    'referrals-authorizations',
    'supporting-veteran-who-does-not-want-therapy'
  ),
  sort_order = case slug
    when 'mental-health-provider-access' then 10
    when 'understanding-treatment-records' then 10
    when 'military-separation-limited-communication' then 10
    when 'pcs-new-duty-station-adjustment' then 20
    when 'tricare-other-health-insurance' then 10
    when 'referrals-authorizations' then 10
    when 'va-health-care-vs-private-insurance' then 20
    when 'provider-billing-rules' then 30
    when 'supporting-veteran-who-does-not-want-therapy' then 10
    when 'changing-va-mental-health-provider' then 20
    else sort_order
  end
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  and resource_kind = 'article'
  and status = 'published';
