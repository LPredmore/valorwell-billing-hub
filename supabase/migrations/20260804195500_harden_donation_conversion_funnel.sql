alter table public.donation_attribution
  add column if not exists landing_path text,
  add column if not exists referrer text,
  add column if not exists entry_cta_source text,
  add column if not exists entry_cta_campaign text,
  add column if not exists entry_cta_content text,
  add column if not exists checkout_cta_source text,
  add column if not exists checkout_cta_campaign text,
  add column if not exists checkout_cta_content text,
  add column if not exists client_captured_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_donation_attribution_created_at
  on public.donation_attribution (created_at desc);
create index if not exists idx_donation_attribution_gclid
  on public.donation_attribution (gclid)
  where gclid is not null;

alter table public.donation_attribution
  drop constraint if exists donation_attribution_token_format_check,
  add constraint donation_attribution_token_format_check
    check (token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  drop constraint if exists donation_attribution_field_lengths_check,
  add constraint donation_attribution_field_lengths_check check (
    char_length(coalesce(gclid, '')) <= 256 and
    char_length(coalesce(gbraid, '')) <= 256 and
    char_length(coalesce(wbraid, '')) <= 256 and
    char_length(coalesce(utm_source, '')) <= 256 and
    char_length(coalesce(utm_medium, '')) <= 256 and
    char_length(coalesce(utm_campaign, '')) <= 256 and
    char_length(coalesce(utm_term, '')) <= 512 and
    char_length(coalesce(utm_content, '')) <= 512 and
    char_length(coalesce(landing_path, '')) <= 2048 and
    char_length(coalesce(referrer, '')) <= 2048 and
    char_length(coalesce(entry_cta_source, '')) <= 256 and
    char_length(coalesce(entry_cta_campaign, '')) <= 256 and
    char_length(coalesce(entry_cta_content, '')) <= 512 and
    char_length(coalesce(checkout_cta_source, '')) <= 256 and
    char_length(coalesce(checkout_cta_campaign, '')) <= 256 and
    char_length(coalesce(checkout_cta_content, '')) <= 512
  );

alter table public.givebutter_donations
  drop constraint if exists givebutter_donations_amount_positive_check,
  add constraint givebutter_donations_amount_positive_check check (amount > 0),
  drop constraint if exists givebutter_donations_currency_format_check,
  add constraint givebutter_donations_currency_format_check check (currency ~ '^[A-Z]{3}$');
