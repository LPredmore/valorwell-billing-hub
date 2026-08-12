create or replace function private.expire_therapist_matches(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_expired integer := 0;
begin
  for r in
    select m.id, m.client_id, m.state
    from public.client_therapist_matches m
    where m.state in ('pending_clinician_acceptance','pending_first_appointment')
      and m.expires_at is not null
      and m.expires_at <= clock_timestamp()
    order by m.expires_at, m.id
    for update skip locked
    limit least(greatest(p_limit, 1), 500)
  loop
    update public.client_therapist_matches
    set state = 'expired',
        resolved_at = clock_timestamp(),
        resolution_reason = 'match_expired',
        capacity_reserved = false,
        version = version + 1,
        updated_at = clock_timestamp()
    where id = r.id;

    perform private.record_therapist_match_event(
      r.id,
      'match_expired',
      r.state,
      'expired',
      null,
      'match_expiration_worker',
      'Match expiration deadline elapsed',
      concat('match:', r.id::text, ':expired:worker'),
      '{}'::jsonb,
      null
    );

    perform private.enqueue_therapist_match_outbox(
      r.id,
      'therapist_match_expired',
      null,
      concat('outbox:match:', r.id::text, ':expired:worker'),
      '{}'::jsonb
    );

    perform private.evaluate_client_provider_demand(
      r.client_id,
      'therapist_match_expired',
      true
    );

    perform public.trg_enqueue_clickup_sync(r.client_id);
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object(
    'expired_count', v_expired,
    'evaluated_at', clock_timestamp()
  );
end
$$;

revoke all on function private.expire_therapist_matches(integer)
  from public, anon, authenticated;
grant execute on function private.expire_therapist_matches(integer)
  to service_role;

create or replace function public.sync_primary_therapist_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch text;
begin
  if current_setting('valorwell.relationship_projection_engine', true) = 'on' then
    return new;
  end if;

  if old.primary_staff_id is not distinct from new.primary_staff_id then
    return new;
  end if;

  update public.client_staff_relationships
  set ended_at = now(),
      end_reason = case
        when new.primary_staff_id is null then 'primary_therapist_removed'
        else 'primary_therapist_changed'
      end,
      updated_at = now(),
      version = version + 1
  where client_id = new.id
    and relationship_type = 'primary_therapist'
    and ended_at is null;

  if new.primary_staff_id is not null then
    select case
      when s.prov_self_scheduling_enabled then 'self_schedule'
      else 'therapist_led'
    end
    into v_branch
    from public.staff s
    where s.id = new.primary_staff_id
      and s.tenant_id = new.tenant_id;

    if v_branch is null then
      raise exception 'Assigned therapist not found for the client tenant'
        using errcode = 'P0002';
    end if;

    insert into public.client_staff_relationships (
      tenant_id,
      client_id,
      staff_id,
      relationship_type,
      source,
      started_at,
      ended_at,
      end_reason,
      scheduling_branch,
      scheduling_expected_by,
      scheduling_moved_at,
      first_scheduled_appointment_id,
      confirmation_state,
      activation_source,
      confirmed_at,
      updated_at
    ) values (
      new.tenant_id,
      new.id,
      new.primary_staff_id,
      'primary_therapist',
      coalesce(
        nullif(current_setting('valorwell.client_state_source', true), ''),
        'primary_staff_assignment'
      ),
      now(),
      null,
      null,
      v_branch,
      case when v_branch = 'therapist_led' then now() + interval '24 hours' else null end,
      null,
      null,
      'confirmed',
      coalesce(
        nullif(current_setting('valorwell.client_state_source', true), ''),
        'primary_staff_assignment'
      ),
      now(),
      now()
    )
    on conflict (client_id, relationship_type) where ended_at is null
    do update set
      staff_id = excluded.staff_id,
      source = excluded.source,
      started_at = excluded.started_at,
      ended_at = null,
      end_reason = null,
      scheduling_branch = excluded.scheduling_branch,
      scheduling_expected_by = excluded.scheduling_expected_by,
      scheduling_moved_at = null,
      first_scheduled_appointment_id = null,
      confirmation_state = 'confirmed',
      activation_source = excluded.activation_source,
      confirmed_at = now(),
      version = public.client_staff_relationships.version + 1,
      updated_at = now();
  end if;

  return new;
end
$$;

revoke all on function public.sync_primary_therapist_relationship()
  from public, anon, authenticated;
grant execute on function public.sync_primary_therapist_relationship()
  to service_role;

create or replace function private.run_therapist_match_outbox_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select nullif(metadata->>'worker_token','')
  into v_token
  from private.relationship_delivery_provider_configs
  where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and provider = 'resend'
    and status in ('test','ready');

  if v_token is null then
    return null;
  end if;

  select net.http_post(
    url := 'https://ahqauomkgflopxgnlndd.supabase.co/functions/v1/therapist-match-outbox-worker',
    body := jsonb_build_object(
      'limit', 25,
      'workerId', 'therapist-match-cron-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISS')
    ),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Relationship-Worker-Token',v_token
    ),
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end
$$;

revoke all on function private.run_therapist_match_outbox_worker()
  from public, anon, authenticated;
grant execute on function private.run_therapist_match_outbox_worker()
  to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job
    where command = 'select private.expire_therapist_matches(100);'
  ) then
    perform cron.schedule(
      'expire-therapist-matches',
      '*/5 * * * *',
      'select private.expire_therapist_matches(100);'
    );
  end if;

  if not exists (
    select 1 from cron.job
    where command = 'select private.run_therapist_match_outbox_worker();'
  ) then
    perform cron.schedule(
      'therapist-match-outbox-worker',
      '* * * * *',
      'select private.run_therapist_match_outbox_worker();'
    );
  end if;
end
$$;
