-- Therapist matching authority foundation.
-- Additive first phase: introduces explicit match workflow, confirmed relationship
-- provenance, transactional commands, safe client context, and reliable outbox claims.
-- Existing selection behavior is preserved until the coordinated cutover migration.

do $$
begin
  create type public.therapist_match_state_enum as enum (
    'legacy_review',
    'pending_clinician_acceptance',
    'pending_first_appointment',
    'activated',
    'declined',
    'expired',
    'cancelled',
    'superseded',
    'invalidated'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.relationship_confirmation_state_enum as enum (
    'confirmed',
    'legacy_review',
    'rejected'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.client_therapist_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  client_id uuid not null references public.clients(id),
  staff_id uuid not null references public.staff(id),
  state public.therapist_match_state_enum not null,
  scheduling_branch text not null
    check (scheduling_branch in ('self_schedule','therapist_led')),
  initiation_source text not null,
  initiated_by_profile_id uuid,
  selected_at timestamptz not null default clock_timestamp(),
  clinician_accepted_at timestamptz,
  clinician_accepted_by_profile_id uuid,
  activated_at timestamptz,
  expires_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  policy_version text not null default 'therapist_match_v1',
  capacity_reserved boolean not null default false,
  idempotency_key text not null,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint client_therapist_matches_terminal_resolution_check check (
    (state in ('activated','declined','expired','cancelled','superseded','invalidated') and resolved_at is not null)
    or
    (state in ('legacy_review','pending_clinician_acceptance','pending_first_appointment') and resolved_at is null)
  )
);

create unique index if not exists client_therapist_matches_idempotency_uidx
  on public.client_therapist_matches (tenant_id, idempotency_key);

create unique index if not exists client_therapist_matches_one_open_per_client_uidx
  on public.client_therapist_matches (client_id)
  where state in ('legacy_review','pending_clinician_acceptance','pending_first_appointment');

create index if not exists client_therapist_matches_staff_open_idx
  on public.client_therapist_matches (staff_id, state, expires_at)
  where state in ('legacy_review','pending_clinician_acceptance','pending_first_appointment');

create index if not exists client_therapist_matches_client_history_idx
  on public.client_therapist_matches (client_id, created_at desc);

alter table public.client_therapist_matches enable row level security;
revoke all on table public.client_therapist_matches from public, anon, authenticated;

create table if not exists public.client_therapist_match_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  match_id uuid not null references public.client_therapist_matches(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  staff_id uuid not null references public.staff(id),
  event_type text not null,
  previous_state public.therapist_match_state_enum,
  new_state public.therapist_match_state_enum,
  actor_profile_id uuid,
  source text not null,
  reason text,
  correlation_id uuid,
  idempotency_key text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create unique index if not exists client_therapist_match_events_idempotency_uidx
  on public.client_therapist_match_events (tenant_id, idempotency_key);

create index if not exists client_therapist_match_events_match_idx
  on public.client_therapist_match_events (match_id, occurred_at);

alter table public.client_therapist_match_events enable row level security;
revoke all on table public.client_therapist_match_events from public, anon, authenticated;

alter table public.client_staff_relationships
  add column if not exists match_id uuid references public.client_therapist_matches(id),
  add column if not exists confirmation_state public.relationship_confirmation_state_enum
    not null default 'confirmed',
  add column if not exists activation_source text,
  add column if not exists activated_by_profile_id uuid,
  add column if not exists activation_evidence jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists version bigint not null default 1;

update public.client_staff_relationships
set activation_source = coalesce(activation_source, source),
    confirmed_at = coalesce(confirmed_at, started_at, created_at)
where confirmation_state = 'confirmed';

create or replace function private.record_therapist_match_event(
  p_match_id uuid,
  p_event_type text,
  p_previous_state public.therapist_match_state_enum,
  p_new_state public.therapist_match_state_enum,
  p_actor_profile_id uuid,
  p_source text,
  p_reason text,
  p_idempotency_key text,
  p_evidence jsonb default '{}'::jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.client_therapist_matches%rowtype;
  v_event_id uuid;
begin
  select *
  into v_match
  from public.client_therapist_matches
  where id = p_match_id;

  if not found then
    raise exception 'Therapist match not found' using errcode = 'P0002';
  end if;

  insert into public.client_therapist_match_events (
    tenant_id,
    match_id,
    client_id,
    staff_id,
    event_type,
    previous_state,
    new_state,
    actor_profile_id,
    source,
    reason,
    correlation_id,
    idempotency_key,
    evidence
  ) values (
    v_match.tenant_id,
    v_match.id,
    v_match.client_id,
    v_match.staff_id,
    p_event_type,
    p_previous_state,
    p_new_state,
    p_actor_profile_id,
    p_source,
    p_reason,
    p_correlation_id,
    p_idempotency_key,
    coalesce(p_evidence, '{}'::jsonb)
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_event_id;

  return v_event_id;
end
$$;

revoke all on function private.record_therapist_match_event(
  uuid,text,public.therapist_match_state_enum,public.therapist_match_state_enum,
  uuid,text,text,text,jsonb,uuid
) from public, anon, authenticated;

create or replace function private.therapist_capacity_snapshot(p_staff_id uuid)
returns table (
  staff_id uuid,
  max_clients integer,
  active_relationships bigint,
  reserved_matches bigint,
  capacity_used bigint,
  capacity_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.prov_max_clients,
    (
      select count(*)
      from public.client_staff_relationships r
      where r.staff_id = s.id
        and r.relationship_type = 'primary_therapist'
        and r.ended_at is null
        and r.confirmation_state = 'confirmed'
    ) as active_relationships,
    (
      select count(*)
      from public.client_therapist_matches m
      where m.staff_id = s.id
        and m.capacity_reserved is true
        and m.state in ('pending_clinician_acceptance','pending_first_appointment')
    ) as reserved_matches,
    (
      select count(*)
      from public.client_staff_relationships r
      where r.staff_id = s.id
        and r.relationship_type = 'primary_therapist'
        and r.ended_at is null
        and r.confirmation_state = 'confirmed'
    )
    +
    (
      select count(*)
      from public.client_therapist_matches m
      where m.staff_id = s.id
        and m.capacity_reserved is true
        and m.state in ('pending_clinician_acceptance','pending_first_appointment')
    ) as capacity_used,
    s.prov_max_clients is null
      or (
        (
          select count(*)
          from public.client_staff_relationships r
          where r.staff_id = s.id
            and r.relationship_type = 'primary_therapist'
            and r.ended_at is null
            and r.confirmation_state = 'confirmed'
        )
        +
        (
          select count(*)
          from public.client_therapist_matches m
          where m.staff_id = s.id
            and m.capacity_reserved is true
            and m.state in ('pending_clinician_acceptance','pending_first_appointment')
        )
      ) < s.prov_max_clients
  from public.staff s
  where s.id = p_staff_id
$$;

revoke all on function private.therapist_capacity_snapshot(uuid)
  from public, anon, authenticated;

create or replace function private.enqueue_therapist_match_outbox(
  p_match_id uuid,
  p_event_type text,
  p_actor_profile_id uuid,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.client_therapist_matches%rowtype;
  v_outbox_id uuid;
begin
  select *
  into v_match
  from public.client_therapist_matches
  where id = p_match_id;

  if not found then
    raise exception 'Therapist match not found' using errcode = 'P0002';
  end if;

  insert into public.integration_outbox (
    tenant_id,
    destination,
    aggregate_type,
    aggregate_id,
    event_type,
    event_version,
    occurred_at,
    actor_profile_id,
    source,
    idempotency_key,
    payload,
    contains_phi,
    status
  ) values (
    v_match.tenant_id,
    'therapist_match_worker',
    'therapist_match',
    v_match.id,
    p_event_type,
    1,
    clock_timestamp(),
    p_actor_profile_id,
    'therapist_match_authority',
    p_idempotency_key,
    jsonb_build_object(
      'match_id', v_match.id,
      'client_id', v_match.client_id,
      'staff_id', v_match.staff_id
    ) || coalesce(p_payload, '{}'::jsonb),
    true,
    'pending'::public.integration_outbox_status_enum
  )
  on conflict (tenant_id, destination, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_outbox_id;

  return v_outbox_id;
end
$$;

revoke all on function private.enqueue_therapist_match_outbox(uuid,text,uuid,text,jsonb)
  from public, anon, authenticated;

create or replace function private.claim_therapist_match_outbox(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  outbox_id uuid,
  tenant_id uuid,
  event_type text,
  aggregate_id uuid,
  payload jsonb,
  attempt_count integer,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select o.id
    from public.integration_outbox o
    where o.destination = 'therapist_match_worker'
      and o.status in ('pending','failed')
      and o.available_at <= clock_timestamp()
      and (
        o.locked_at is null
        or o.locked_at < clock_timestamp() - make_interval(secs => greatest(p_lease_seconds, 30))
      )
      and o.attempt_count < 8
    order by o.available_at, o.created_at, o.id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ),
  claimed as (
    update public.integration_outbox o
    set status = 'processing'::public.integration_outbox_status_enum,
        attempt_count = o.attempt_count + 1,
        locked_at = clock_timestamp(),
        locked_by = p_worker_id,
        updated_at = clock_timestamp()
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select
    c.id,
    c.tenant_id,
    c.event_type,
    c.aggregate_id,
    c.payload,
    c.attempt_count,
    concat(c.id::text, ':', c.attempt_count::text, ':', p_worker_id)
  from claimed c;
end
$$;

revoke all on function private.claim_therapist_match_outbox(text,integer,integer)
  from public, anon, authenticated;
grant execute on function private.claim_therapist_match_outbox(text,integer,integer)
  to service_role;

create or replace function private.record_therapist_match_outbox_result(
  p_outbox_id uuid,
  p_claim_token text,
  p_outcome text,
  p_error_code text default null,
  p_error_detail text default null,
  p_retry_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.integration_outbox%rowtype;
  v_expected_prefix text;
begin
  select *
  into v_row
  from public.integration_outbox
  where id = p_outbox_id
  for update;

  if not found then
    raise exception 'Outbox item not found' using errcode = 'P0002';
  end if;

  v_expected_prefix := concat(v_row.id::text, ':', v_row.attempt_count::text, ':');
  if left(p_claim_token, length(v_expected_prefix)) <> v_expected_prefix
     or v_row.status <> 'processing'::public.integration_outbox_status_enum then
    raise exception 'Outbox claim is stale' using errcode = '40001';
  end if;

  if p_outcome = 'delivered' then
    update public.integration_outbox
    set status = 'delivered'::public.integration_outbox_status_enum,
        delivered_at = clock_timestamp(),
        locked_at = null,
        locked_by = null,
        last_error_code = null,
        last_error_detail = null,
        updated_at = clock_timestamp()
    where id = p_outbox_id;
  elsif p_outcome = 'retry' then
    update public.integration_outbox
    set status = 'failed'::public.integration_outbox_status_enum,
        available_at = coalesce(
          p_retry_at,
          clock_timestamp() + make_interval(mins => least(60, power(2, least(attempt_count, 6))::integer))
        ),
        locked_at = null,
        locked_by = null,
        last_error_code = p_error_code,
        last_error_detail = p_error_detail,
        updated_at = clock_timestamp()
    where id = p_outbox_id;
  elsif p_outcome = 'dead_letter' then
    update public.integration_outbox
    set status = 'dead_letter'::public.integration_outbox_status_enum,
        dead_lettered_at = clock_timestamp(),
        locked_at = null,
        locked_by = null,
        last_error_code = p_error_code,
        last_error_detail = p_error_detail,
        updated_at = clock_timestamp()
    where id = p_outbox_id;
  else
    raise exception 'Unsupported outbox outcome' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'outbox_id', p_outbox_id,
    'outcome', p_outcome,
    'attempt_count', v_row.attempt_count
  );
end
$$;

revoke all on function private.record_therapist_match_outbox_result(
  uuid,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function private.record_therapist_match_outbox_result(
  uuid,text,text,text,text,timestamptz
) to service_role;

create or replace function public.claim_therapist_match_outbox(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  outbox_id uuid,
  tenant_id uuid,
  event_type text,
  aggregate_id uuid,
  payload jsonb,
  attempt_count integer,
  claim_token text
)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.claim_therapist_match_outbox(
    p_worker_id,
    p_limit,
    p_lease_seconds
  )
$$;

revoke all on function public.claim_therapist_match_outbox(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_therapist_match_outbox(text,integer,integer)
  to service_role;

create or replace function public.record_therapist_match_outbox_result(
  p_outbox_id uuid,
  p_claim_token text,
  p_outcome text,
  p_error_code text default null,
  p_error_detail text default null,
  p_retry_at timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.record_therapist_match_outbox_result(
    p_outbox_id,
    p_claim_token,
    p_outcome,
    p_error_code,
    p_error_detail,
    p_retry_at
  )
$$;

revoke all on function public.record_therapist_match_outbox_result(
  uuid,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_therapist_match_outbox_result(
  uuid,text,text,text,text,timestamptz
) to service_role;
