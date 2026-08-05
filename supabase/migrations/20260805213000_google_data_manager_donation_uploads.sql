-- Google Data Manager API upload state for completed Givebutter donations.
alter table public.givebutter_donations
  add column if not exists ads_request_id text,
  add column if not exists ads_attempt_count integer not null default 0,
  add column if not exists ads_last_attempt_at timestamptz,
  add column if not exists ads_next_attempt_at timestamptz,
  add column if not exists ads_diagnostics_checked_at timestamptz,
  add column if not exists ads_identifier_type text,
  add column if not exists ads_upload_details jsonb not null default '{}'::jsonb;

alter table public.givebutter_donations
  drop constraint if exists givebutter_donations_ads_upload_status_check;

alter table public.givebutter_donations
  add constraint givebutter_donations_ads_upload_status_check
  check (ads_upload_status in (
    'pending',
    'submitting',
    'processing',
    'succeeded',
    'partial_success',
    'retry',
    'failed',
    'unattributed',
    'expired'
  ));

alter table public.givebutter_donations
  drop constraint if exists givebutter_donations_ads_identifier_type_check;

alter table public.givebutter_donations
  add constraint givebutter_donations_ads_identifier_type_check
  check (
    ads_identifier_type is null
    or ads_identifier_type in ('gclid', 'gbraid', 'wbraid')
  );

create index if not exists idx_givebutter_donations_ads_queue
  on public.givebutter_donations (ads_upload_status, ads_next_attempt_at, donated_at);

create index if not exists idx_givebutter_donations_ads_request_id
  on public.givebutter_donations (ads_request_id)
  where ads_request_id is not null;

create or replace function public.claim_google_ads_donations(p_limit integer default 10)
returns table (
  transaction_id text,
  token text,
  amount numeric,
  currency text,
  donated_at timestamptz,
  gclid text,
  gbraid text,
  wbraid text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select d.transaction_id
    from public.givebutter_donations d
    join public.donation_attribution a on a.token = d.token
    where d.donated_at >= now() - interval '90 days'
      and d.donated_at <= now() - interval '6 hours'
      and (a.gclid is not null or a.gbraid is not null or a.wbraid is not null)
      and (
        (
          d.ads_upload_status in ('pending', 'retry')
          and (d.ads_next_attempt_at is null or d.ads_next_attempt_at <= now())
        )
        or (
          d.ads_upload_status = 'submitting'
          and d.ads_last_attempt_at < now() - interval '20 minutes'
        )
      )
    order by d.donated_at, d.transaction_id
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  ),
  claimed as (
    update public.givebutter_donations d
    set ads_upload_status = 'submitting',
        ads_attempt_count = d.ads_attempt_count + 1,
        ads_last_attempt_at = now(),
        ads_next_attempt_at = null,
        ads_upload_error = null,
        ads_upload_details = coalesce(d.ads_upload_details, '{}'::jsonb)
    from candidates c
    where d.transaction_id = c.transaction_id
    returning d.transaction_id,
              d.token,
              d.amount,
              d.currency,
              d.donated_at,
              d.ads_attempt_count
  )
  select c.transaction_id,
         c.token,
         c.amount,
         c.currency,
         c.donated_at,
         a.gclid,
         a.gbraid,
         a.wbraid,
         c.ads_attempt_count
  from claimed c
  join public.donation_attribution a on a.token = c.token
  order by c.donated_at, c.transaction_id;
end;
$$;

revoke all on function public.claim_google_ads_donations(integer) from public, anon, authenticated;
grant execute on function public.claim_google_ads_donations(integer) to service_role;

comment on function public.claim_google_ads_donations(integer) is
  'Atomically claims attributable Givebutter donations for Google Data Manager upload.';
