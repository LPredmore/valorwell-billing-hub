create or replace function public.accept_therapist_match(
  p_match_id uuid,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_match public.client_therapist_matches%rowtype;
  v_staff public.staff%rowtype;
  v_eligible record;
  v_result jsonb;
begin
  if v_actor is null and not private.valorwell_is_admin() then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'A stable idempotency key is required' using errcode = '22023';
  end if;

  select * into v_match
  from public.client_therapist_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Therapist match not found' using errcode = 'P0002';
  end if;

  select * into v_staff
  from public.staff
  where id = v_match.staff_id
    and tenant_id = v_match.tenant_id
  for update;

  if not found then
    raise exception 'Therapist not found' using errcode = 'P0002';
  end if;

  if not private.valorwell_is_admin()
     and v_staff.profile_id is distinct from v_actor then
    raise exception 'Only the selected therapist or an administrator may accept this match'
      using errcode = '42501';
  end if;

  if v_match.state = 'activated' then
    return private.activate_therapist_match(
      v_match.id,
      v_actor,
      'therapist_acceptance',
      'Therapist accepted the match',
      p_idempotency_key
    );
  end if;

  if v_match.version <> p_expected_version then
    raise exception 'Therapist match changed; refresh and retry'
      using errcode = '40001';
  end if;

  if v_match.state <> 'pending_clinician_acceptance' then
    raise exception 'Therapist match is not awaiting clinician acceptance'
      using errcode = '22023';
  end if;

  if v_match.expires_at is not null and v_match.expires_at <= clock_timestamp() then
    update public.client_therapist_matches
    set state = 'expired',
        resolved_at = clock_timestamp(),
        resolution_reason = 'acceptance_window_expired',
        capacity_reserved = false,
        version = version + 1,
        updated_at = clock_timestamp()
    where id = v_match.id;

    perform private.record_therapist_match_event(
      v_match.id,
      'match_expired',
      v_match.state,
      'expired',
      v_actor,
      'therapist_acceptance',
      'Acceptance attempted after expiration',
      concat('match:', v_match.id::text, ':expired:accept-attempt'),
      '{}'::jsonb,
      null
    );

    perform private.evaluate_client_provider_demand(
      v_match.client_id,
      'therapist_match_expired',
      true
    );

    return jsonb_build_object(
      'success', false,
      'result', 'expired',
      'match_id', v_match.id
    );
  end if;

  select * into v_eligible
  from private.eligible_therapists_for_client(v_match.client_id)
  where id = v_match.staff_id;

  if not found then
    update public.client_therapist_matches
    set state = 'invalidated',
        resolved_at = clock_timestamp(),
        resolution_reason = 'therapist_no_longer_eligible',
        capacity_reserved = false,
        version = version + 1,
        updated_at = clock_timestamp()
    where id = v_match.id;

    perform private.record_therapist_match_event(
      v_match.id,
      'match_invalidated',
      v_match.state,
      'invalidated',
      v_actor,
      'therapist_acceptance',
      'Therapist was no longer eligible at acceptance',
      concat('match:', v_match.id::text, ':invalidated:eligibility'),
      '{}'::jsonb,
      null
    );

    perform private.evaluate_client_provider_demand(
      v_match.client_id,
      'therapist_match_invalidated',
      true
    );

    return jsonb_build_object(
      'success', false,
      'result', 'therapist_no_longer_eligible',
      'match_id', v_match.id
    );
  end if;

  update public.client_therapist_matches
  set clinician_accepted_at = clock_timestamp(),
      clinician_accepted_by_profile_id = v_actor,
      version = version + 1,
      updated_at = clock_timestamp()
  where id = v_match.id;

  v_result := private.activate_therapist_match(
    v_match.id,
    v_actor,
    'therapist_acceptance',
    'Therapist accepted the match',
    p_idempotency_key
  );

  return v_result;
end
$$;

revoke all on function public.accept_therapist_match(uuid,bigint,text)
  from public, anon;
grant execute on function public.accept_therapist_match(uuid,bigint,text)
  to authenticated, service_role;

create or replace function public.decline_therapist_match(
  p_match_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_match public.client_therapist_matches%rowtype;
  v_staff public.staff%rowtype;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'A stable idempotency key is required' using errcode = '22023';
  end if;

  select * into v_match
  from public.client_therapist_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Therapist match not found' using errcode = 'P0002';
  end if;

  select * into v_staff
  from public.staff
  where id = v_match.staff_id
    and tenant_id = v_match.tenant_id;

  if not private.valorwell_is_admin()
     and (v_actor is null or v_staff.profile_id is distinct from v_actor) then
    raise exception 'Only the selected therapist or an administrator may decline this match'
      using errcode = '42501';
  end if;

  if v_match.state = 'declined' then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'match_id', v_match.id,
      'match_state', v_match.state
    );
  end if;

  if v_match.version <> p_expected_version then
    raise exception 'Therapist match changed; refresh and retry'
      using errcode = '40001';
  end if;

  if v_match.state <> 'pending_clinician_acceptance' then
    raise exception 'Therapist match is not awaiting clinician acceptance'
      using errcode = '22023';
  end if;

  update public.client_therapist_matches
  set state = 'declined',
      resolved_at = clock_timestamp(),
      resolution_reason = coalesce(nullif(trim(p_reason), ''), 'therapist_declined'),
      capacity_reserved = false,
      version = version + 1,
      updated_at = clock_timestamp()
  where id = v_match.id;

  perform private.record_therapist_match_event(
    v_match.id,
    'match_declined',
    v_match.state,
    'declined',
    v_actor,
    'therapist_decline',
    p_reason,
    concat('match:', v_match.id::text, ':declined:', p_idempotency_key),
    '{}'::jsonb,
    null
  );

  perform private.enqueue_therapist_match_outbox(
    v_match.id,
    'therapist_match_declined',
    v_actor,
    concat('outbox:match:', v_match.id::text, ':declined:', p_idempotency_key),
    jsonb_build_object('reason', p_reason)
  );

  perform private.evaluate_client_provider_demand(
    v_match.client_id,
    'therapist_match_declined',
    true
  );

  perform public.trg_enqueue_clickup_sync(v_match.client_id);

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'match_id', v_match.id,
    'match_state', 'declined'
  );
end
$$;

revoke all on function public.decline_therapist_match(uuid,bigint,text,text)
  from public, anon;
grant execute on function public.decline_therapist_match(uuid,bigint,text,text)
  to authenticated, service_role;

create or replace function public.cancel_current_therapist_match(
  p_idempotency_key text,
  p_reason text default 'client_cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid := public.current_client_id();
  v_match public.client_therapist_matches%rowtype;
begin
  if v_actor is null or v_client_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'A stable idempotency key is required' using errcode = '22023';
  end if;

  select * into v_match
  from public.client_therapist_matches
  where client_id = v_client_id
    and state in ('pending_clinician_acceptance','pending_first_appointment')
  for update;

  if not found then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'result', 'no_open_match'
    );
  end if;

  update public.client_therapist_matches
  set state = 'cancelled',
      resolved_at = clock_timestamp(),
      resolution_reason = coalesce(nullif(trim(p_reason), ''), 'client_cancelled'),
      capacity_reserved = false,
      version = version + 1,
      updated_at = clock_timestamp()
  where id = v_match.id;

  perform private.record_therapist_match_event(
    v_match.id,
    'match_cancelled',
    v_match.state,
    'cancelled',
    v_actor,
    'client_portal',
    p_reason,
    concat('match:', v_match.id::text, ':cancelled:', p_idempotency_key),
    '{}'::jsonb,
    null
  );

  perform private.evaluate_client_provider_demand(
    v_match.client_id,
    'therapist_match_cancelled',
    true
  );

  perform public.trg_enqueue_clickup_sync(v_match.client_id);

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'match_id', v_match.id,
    'match_state', 'cancelled'
  );
end
$$;

revoke all on function public.cancel_current_therapist_match(text,text)
  from public, anon;
grant execute on function public.cancel_current_therapist_match(text,text)
  to authenticated, service_role;

create or replace function public.book_pending_therapist_match_appointment(
  p_slot_start_utc timestamptz,
  p_slot_end_utc timestamptz default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid := public.current_client_id();
  v_match public.client_therapist_matches%rowtype;
  v_activation jsonb;
  v_booking jsonb;
begin
  if v_actor is null or v_client_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'A stable idempotency key is required' using errcode = '22023';
  end if;

  select * into v_match
  from public.client_therapist_matches
  where client_id = v_client_id
    and state = 'pending_first_appointment'
  for update;

  if not found then
    raise exception 'No pending self-scheduling therapist match exists'
      using errcode = 'P0002';
  end if;

  if v_match.expires_at is not null and v_match.expires_at <= clock_timestamp() then
    raise exception 'Therapist match has expired' using errcode = '22023';
  end if;

  v_activation := private.activate_therapist_match(
    v_match.id,
    v_actor,
    'first_appointment_booking',
    'Client booked the first appointment for a self-scheduling match',
    p_idempotency_key
  );

  v_booking := public.book_client_appointment(p_slot_start_utc, p_slot_end_utc);

  perform private.enqueue_therapist_match_outbox(
    v_match.id,
    'therapist_first_appointment_booked',
    v_actor,
    concat(
      'outbox:match:',
      v_match.id::text,
      ':first-appointment:',
      coalesce(v_booking->>'appointment_id', p_idempotency_key)
    ),
    jsonb_build_object('appointment_id', v_booking->>'appointment_id')
  );

  return v_booking
    || jsonb_build_object(
      'match_id', v_match.id,
      'relationship_id', v_activation->>'relationship_id',
      'match_state', 'activated'
    );
end
$$;

revoke all on function public.book_pending_therapist_match_appointment(
  timestamptz,timestamptz,text
) from public, anon;
grant execute on function public.book_pending_therapist_match_appointment(
  timestamptz,timestamptz,text
) to authenticated, service_role;

create or replace function public.get_current_client_therapist_authority()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client_id uuid := public.current_client_id();
  v_client public.clients%rowtype;
  v_relationship public.client_staff_relationships%rowtype;
  v_match public.client_therapist_matches%rowtype;
  v_staff public.staff%rowtype;
  v_licenses jsonb := '[]'::jsonb;
  v_staff_json jsonb;
  v_relationship_state text := 'none';
  v_match_state text := 'none';
begin
  if v_client_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_client
  from public.clients
  where id = v_client_id;

  select * into v_relationship
  from public.client_staff_relationships
  where client_id = v_client.id
    and relationship_type = 'primary_therapist'
    and ended_at is null
  order by created_at desc
  limit 1;

  select * into v_match
  from public.client_therapist_matches
  where client_id = v_client.id
    and state in ('legacy_review','pending_clinician_acceptance','pending_first_appointment')
  order by created_at desc
  limit 1;

  if v_relationship.id is not null then
    v_relationship_state := v_relationship.confirmation_state::text;
  end if;
  if v_match.id is not null then
    v_match_state := v_match.state::text;
  end if;

  if v_relationship.id is not null then
    select * into v_staff
    from public.staff
    where id = v_relationship.staff_id
      and tenant_id = v_client.tenant_id;
  elsif v_match.id is not null then
    select * into v_staff
    from public.staff
    where id = v_match.staff_id
      and tenant_id = v_client.tenant_id;
  end if;

  if v_staff.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'license_state', sl.license_state,
          'license_type', sl.license_type,
          'expiration_date', sl.expiration_date
        )
        order by sl.license_state, sl.license_type
      ),
      '[]'::jsonb
    ) into v_licenses
    from public.staff_licenses sl
    where sl.staff_id = v_staff.id
      and sl.is_active is true;

    v_staff_json := jsonb_build_object(
      'id', v_staff.id,
      'display_name', coalesce(
        v_staff.prov_name_for_clients,
        nullif(trim(concat_ws(' ', v_staff.prov_name_f, v_staff.prov_name_l)), ''),
        'Therapist'
      ),
      'first_name', v_staff.prov_name_f,
      'last_name', v_staff.prov_name_l,
      'bio', v_staff.prov_bio,
      'image_url', v_staff.prov_image_url,
      'treatment_approaches', v_staff.prov_treatment_approaches,
      'license_type', v_staff.prov_license_type,
      'self_scheduling_enabled', v_staff.prov_self_scheduling_enabled,
      'accepting_new_clients', v_staff.prov_accepting_new_clients,
      'status', v_staff.prov_status,
      'licenses', v_licenses
    );
  end if;

  return jsonb_build_object(
    'client_id', v_client.id,
    'lifecycle_stage', v_client.lifecycle_stage,
    'relationship_state', v_relationship_state,
    'relationship', case
      when v_relationship.id is null then null
      else jsonb_build_object(
        'id', v_relationship.id,
        'staff_id', v_relationship.staff_id,
        'confirmation_state', v_relationship.confirmation_state,
        'activation_source', v_relationship.activation_source,
        'confirmed_at', v_relationship.confirmed_at,
        'scheduling_branch', v_relationship.scheduling_branch,
        'scheduling_expected_by', v_relationship.scheduling_expected_by,
        'started_at', v_relationship.started_at
      )
    end,
    'match_state', v_match_state,
    'match', case
      when v_match.id is null then null
      else jsonb_build_object(
        'id', v_match.id,
        'staff_id', v_match.staff_id,
        'state', v_match.state,
        'scheduling_branch', v_match.scheduling_branch,
        'selected_at', v_match.selected_at,
        'expires_at', v_match.expires_at,
        'version', v_match.version,
        'initiation_source', v_match.initiation_source
      )
    end,
    'therapist', v_staff_json,
    'can_message_therapist',
      v_relationship.id is not null
      and v_relationship.confirmation_state = 'confirmed',
    'can_book_first_appointment',
      v_match.id is not null
      and v_match.state = 'pending_first_appointment'
      and (v_match.expires_at is null or v_match.expires_at > clock_timestamp()),
    'can_cancel_match',
      v_match.id is not null
      and v_match.state in ('pending_clinician_acceptance','pending_first_appointment'),
    'can_contact_support', true,
    'contract_version', 'therapist_authority_v1',
    'generated_at', clock_timestamp()
  );
end
$$;

revoke all on function public.get_current_client_therapist_authority()
  from public, anon;
grant execute on function public.get_current_client_therapist_authority()
  to authenticated, service_role;
