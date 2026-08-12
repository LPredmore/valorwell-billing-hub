create or replace function private.activate_therapist_match(
  p_match_id uuid,
  p_actor_profile_id uuid,
  p_activation_source text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.client_therapist_matches%rowtype;
  v_client public.clients%rowtype;
  v_staff public.staff%rowtype;
  v_relationship_id uuid;
  v_previous_projection_engine text;
  v_previous_context jsonb;
  v_event_key text;
begin
  select * into v_match
  from public.client_therapist_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Therapist match not found' using errcode = 'P0002';
  end if;

  if v_match.state = 'activated' then
    select r.id into v_relationship_id
    from public.client_staff_relationships r
    where r.match_id = v_match.id
      and r.relationship_type = 'primary_therapist'
      and r.ended_at is null
    limit 1;

    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'match_id', v_match.id,
      'relationship_id', v_relationship_id,
      'client_id', v_match.client_id,
      'staff_id', v_match.staff_id
    );
  end if;

  if v_match.state not in (
    'pending_clinician_acceptance',
    'pending_first_appointment',
    'legacy_review'
  ) then
    raise exception 'Therapist match is not activatable from state %', v_match.state
      using errcode = '22023';
  end if;

  if v_match.expires_at is not null and v_match.expires_at <= clock_timestamp() then
    raise exception 'Therapist match has expired' using errcode = '22023';
  end if;

  select * into v_client
  from public.clients
  where id = v_match.client_id
    and tenant_id = v_match.tenant_id
  for update;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  select * into v_staff
  from public.staff
  where id = v_match.staff_id
    and tenant_id = v_match.tenant_id
  for update;

  if not found or v_staff.prov_status::text <> 'Active' then
    raise exception 'Therapist is not active' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.client_staff_relationships r
    where r.client_id = v_client.id
      and r.relationship_type = 'primary_therapist'
      and r.ended_at is null
      and r.confirmation_state = 'confirmed'
      and r.staff_id <> v_staff.id
  ) then
    raise exception 'Client already has another confirmed therapist relationship'
      using errcode = '23505';
  end if;

  insert into public.client_staff_relationships (
    tenant_id,
    client_id,
    staff_id,
    relationship_type,
    source,
    started_at,
    scheduling_branch,
    scheduling_expected_by,
    match_id,
    confirmation_state,
    activation_source,
    activated_by_profile_id,
    activation_evidence,
    confirmed_at,
    updated_at
  ) values (
    v_match.tenant_id,
    v_match.client_id,
    v_match.staff_id,
    'primary_therapist',
    p_activation_source,
    clock_timestamp(),
    v_match.scheduling_branch,
    case
      when v_match.scheduling_branch = 'therapist_led'
        then clock_timestamp() + interval '24 hours'
      else null
    end,
    v_match.id,
    'confirmed',
    p_activation_source,
    p_actor_profile_id,
    jsonb_build_object(
      'match_id', v_match.id,
      'match_state', v_match.state,
      'reason', p_reason,
      'policy_version', v_match.policy_version
    ),
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (client_id, relationship_type) where ended_at is null
  do update set
    staff_id = excluded.staff_id,
    source = excluded.source,
    started_at = excluded.started_at,
    scheduling_branch = excluded.scheduling_branch,
    scheduling_expected_by = excluded.scheduling_expected_by,
    scheduling_moved_at = null,
    first_scheduled_appointment_id = null,
    match_id = excluded.match_id,
    confirmation_state = excluded.confirmation_state,
    activation_source = excluded.activation_source,
    activated_by_profile_id = excluded.activated_by_profile_id,
    activation_evidence = excluded.activation_evidence,
    confirmed_at = excluded.confirmed_at,
    version = public.client_staff_relationships.version + 1,
    updated_at = clock_timestamp()
  returning id into v_relationship_id;

  v_previous_projection_engine := current_setting('valorwell.relationship_projection_engine', true);
  v_previous_context := public.client_state_engine_begin_context(
    p_activation_source,
    p_reason,
    p_actor_profile_id
  );
  perform set_config('valorwell.relationship_projection_engine', 'on', true);

  begin
    update public.clients
    set primary_staff_id = v_match.staff_id,
        lifecycle_stage = case
          when lifecycle_stage::text in ('intake','matching') then 'matched'::public.client_lifecycle_stage_enum
          else lifecycle_stage
        end,
        closure_reason = null,
        closed_at = null,
        at_risk = false,
        at_risk_since = null,
        at_risk_anchor_at = clock_timestamp()
    where id = v_match.client_id;

    update public.client_therapist_matches
    set state = 'activated',
        clinician_accepted_at = case
          when scheduling_branch = 'therapist_led'
            then coalesce(clinician_accepted_at, clock_timestamp())
          else clinician_accepted_at
        end,
        clinician_accepted_by_profile_id = case
          when scheduling_branch = 'therapist_led'
            then coalesce(clinician_accepted_by_profile_id, p_actor_profile_id)
          else clinician_accepted_by_profile_id
        end,
        activated_at = clock_timestamp(),
        resolved_at = clock_timestamp(),
        resolution_reason = p_reason,
        capacity_reserved = false,
        version = version + 1,
        updated_at = clock_timestamp()
    where id = v_match.id;

    update public.client_provider_demand
    set resolved_at = coalesce(resolved_at, clock_timestamp()),
        resolution_reason = 'confirmed_therapist_relationship',
        last_evaluated_at = clock_timestamp(),
        last_evaluation_source = p_activation_source,
        release_notification_state = 'not_applicable',
        updated_at = clock_timestamp(),
        version = version + 1
    where client_id = v_match.client_id
      and resolved_at is null;

    v_event_key := concat('match:', v_match.id::text, ':activated:', p_idempotency_key);
    perform private.record_therapist_match_event(
      v_match.id,
      'relationship_activated',
      v_match.state,
      'activated',
      p_actor_profile_id,
      p_activation_source,
      p_reason,
      v_event_key,
      jsonb_build_object('relationship_id', v_relationship_id),
      null
    );

    perform private.enqueue_therapist_match_outbox(
      v_match.id,
      'therapist_match_activated',
      p_actor_profile_id,
      concat('outbox:', v_event_key),
      jsonb_build_object('relationship_id', v_relationship_id)
    );

    perform public.trg_enqueue_clickup_sync(v_match.client_id);

    perform set_config(
      'valorwell.relationship_projection_engine',
      coalesce(v_previous_projection_engine, ''),
      true
    );
    perform public.client_state_engine_restore_context(v_previous_context);
  exception when others then
    perform set_config(
      'valorwell.relationship_projection_engine',
      coalesce(v_previous_projection_engine, ''),
      true
    );
    perform public.client_state_engine_restore_context(v_previous_context);
    raise;
  end;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'match_id', v_match.id,
    'relationship_id', v_relationship_id,
    'client_id', v_match.client_id,
    'staff_id', v_match.staff_id,
    'lifecycle_stage', 'matched',
    'scheduling_branch', v_match.scheduling_branch
  );
end
$$;

revoke all on function private.activate_therapist_match(uuid,uuid,text,text,text)
  from public, anon, authenticated;

create or replace function public.request_therapist_match(
  p_staff_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid := public.current_client_id();
  v_client public.clients%rowtype;
  v_readiness record;
  v_selected record;
  v_staff public.staff%rowtype;
  v_capacity record;
  v_match public.client_therapist_matches%rowtype;
  v_state public.therapist_match_state_enum;
  v_expires_at timestamptz;
  v_event_key text;
begin
  if v_actor is null or v_client_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'A stable idempotency key is required' using errcode = '22023';
  end if;

  select * into v_match
  from public.client_therapist_matches
  where tenant_id = (
      select c.tenant_id from public.clients c where c.id = v_client_id
    )
    and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'match_id', v_match.id,
      'client_id', v_match.client_id,
      'staff_id', v_match.staff_id,
      'match_state', v_match.state,
      'scheduling_branch', v_match.scheduling_branch,
      'expires_at', v_match.expires_at
    );
  end if;

  perform private.authorize_client_matching_workflow(v_client_id, false);
  perform public.advance_client_intake_if_ready(v_client_id);

  select * into v_client
  from public.clients
  where id = v_client_id
  for update;

  if v_client.lifecycle_stage::text <> 'matching' then
    raise exception 'Client must be in Matching before therapist selection'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.client_staff_relationships r
    where r.client_id = v_client.id
      and r.relationship_type = 'primary_therapist'
      and r.ended_at is null
      and r.confirmation_state = 'confirmed'
  ) then
    raise exception 'Client already has a confirmed therapist relationship'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.client_therapist_matches m
    where m.client_id = v_client.id
      and m.state in ('legacy_review','pending_clinician_acceptance','pending_first_appointment')
  ) then
    raise exception 'Client already has an open therapist match'
      using errcode = '23505';
  end if;

  select * into v_readiness
  from private.client_care_readiness(v_client.id);

  if v_readiness.therapist_selection_ready is not true then
    raise exception 'Client care readiness is incomplete: %',
      array_to_string(v_readiness.missing_gates, ', ')
      using errcode = '22023';
  end if;

  select * into v_selected
  from private.eligible_therapists_for_client(v_client.id)
  where id = p_staff_id;

  if not found then
    raise exception 'Therapist is no longer eligible for this client'
      using errcode = '22023';
  end if;

  select * into v_staff
  from public.staff
  where id = p_staff_id
    and tenant_id = v_client.tenant_id
  for update;

  if not found or v_staff.prov_status::text <> 'Active'
     or v_staff.prov_accepting_new_clients is not true then
    raise exception 'Therapist is not accepting new matches'
      using errcode = '22023';
  end if;

  select * into v_capacity
  from private.therapist_capacity_snapshot(v_staff.id);

  if v_capacity.capacity_available is not true then
    raise exception 'Therapist capacity is no longer available'
      using errcode = '40001';
  end if;

  v_state := case
    when v_staff.prov_self_scheduling_enabled is true
      then 'pending_first_appointment'::public.therapist_match_state_enum
    else 'pending_clinician_acceptance'::public.therapist_match_state_enum
  end;

  v_expires_at := case
    when v_state = 'pending_first_appointment' then clock_timestamp() + interval '7 days'
    else clock_timestamp() + interval '72 hours'
  end;

  insert into public.client_therapist_matches (
    tenant_id,
    client_id,
    staff_id,
    state,
    scheduling_branch,
    initiation_source,
    initiated_by_profile_id,
    selected_at,
    expires_at,
    eligibility_snapshot,
    capacity_reserved,
    idempotency_key
  ) values (
    v_client.tenant_id,
    v_client.id,
    v_staff.id,
    v_state,
    case when v_staff.prov_self_scheduling_enabled then 'self_schedule' else 'therapist_led' end,
    'client_selection',
    v_actor,
    clock_timestamp(),
    v_expires_at,
    jsonb_build_object(
      'client_state', v_client.pat_state,
      'client_age', case
        when v_client.pat_dob is null then null
        else extract(year from age(current_date, v_client.pat_dob))::integer
      end,
      'pathway_code', v_readiness.pathway_code,
      'staff_status', v_staff.prov_status,
      'accepting_new_clients', v_staff.prov_accepting_new_clients,
      'capacity_max', v_capacity.max_clients,
      'capacity_used_before_reservation', v_capacity.capacity_used
    ),
    true,
    p_idempotency_key
  ) returning * into v_match;

  v_event_key := concat('match:', v_match.id::text, ':created');
  perform private.record_therapist_match_event(
    v_match.id,
    'match_created',
    null,
    v_match.state,
    v_actor,
    'client_selection',
    'Client selected a server-validated eligible therapist',
    v_event_key,
    v_match.eligibility_snapshot,
    null
  );

  update public.client_provider_demand
  set resolved_at = coalesce(resolved_at, clock_timestamp()),
      resolution_reason = 'therapist_capacity_reserved',
      last_evaluated_at = clock_timestamp(),
      last_evaluation_source = 'therapist_match_request',
      release_notification_state = 'not_applicable',
      updated_at = clock_timestamp(),
      version = version + 1
  where client_id = v_client.id
    and resolved_at is null;

  if v_match.state = 'pending_clinician_acceptance' then
    perform private.enqueue_therapist_match_outbox(
      v_match.id,
      'therapist_match_acceptance_requested',
      v_actor,
      concat('outbox:', v_event_key, ':acceptance-request'),
      jsonb_build_object('expires_at', v_match.expires_at)
    );
  end if;

  perform public.trg_enqueue_clickup_sync(v_client.id);

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'match_id', v_match.id,
    'client_id', v_match.client_id,
    'staff_id', v_match.staff_id,
    'match_state', v_match.state,
    'lifecycle_stage', v_client.lifecycle_stage,
    'scheduling_branch', v_match.scheduling_branch,
    'expires_at', v_match.expires_at
  );
end
$$;

revoke all on function public.request_therapist_match(uuid,text)
  from public, anon;
grant execute on function public.request_therapist_match(uuid,text)
  to authenticated, service_role;
