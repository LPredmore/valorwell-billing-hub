alter table public.donation_attribution
  add column if not exists entry_cta_medium text,
  add column if not exists checkout_cta_medium text;

alter table public.donation_attribution
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
    char_length(coalesce(entry_cta_medium, '')) <= 256 and
    char_length(coalesce(entry_cta_campaign, '')) <= 256 and
    char_length(coalesce(entry_cta_content, '')) <= 512 and
    char_length(coalesce(checkout_cta_source, '')) <= 256 and
    char_length(coalesce(checkout_cta_medium, '')) <= 256 and
    char_length(coalesce(checkout_cta_campaign, '')) <= 256 and
    char_length(coalesce(checkout_cta_content, '')) <= 512
  );
