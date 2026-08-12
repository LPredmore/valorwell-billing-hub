create or replace function public.admin_normalize_legacy_review_lifecycle(
  p_client_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r record;
  v_readiness record;
  v_previous_projection text;
  v_previous_state_context jsonb;
  v_target public.client_lifecycle_stage_enum;
  v_intake integer := 0;
  v_matching integer := 0;
  v_unchanged integer := 0;
begin
  if not private.therapist_match_admin_authorized() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_client_action_id,''))) < 8 then
    raise exception 'A client action id is required' using errcode='22023';
  end if;

  for r in
    select distinct c.id,c.lifecycle_stage
    from public.clients c
    join public.client_staff_relationships rel
      on rel.client_id=c.id
     and rel.relationship_type='primary_therapist'
     and rel.ended_at is null
     and rel.confirmation_state='legacy_review'
    join public.client_therapist_matches m
      on m.id=rel.match_id
     and m.state='legacy_review'
    where c.lifecycle_stage::text <> 'closed'
    order by c.id
    for update of c
  loop
    select * into v_readiness
    from private.client_care_readiness(r.id);

    v_target := case
      when v_readiness.therapist_selection_ready is true
        then 'matching'::public.client_lifecycle_stage_enum
      else 'intake'::public.client_lifecycle_stage_enum
    end;

    if r.lifecycle_stage = v_target then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    v_previous_projection := current_setting('valorwell.relationship_projection_engine',true);
    v_previous_state_context := public.client_state_engine_begin_context(
      'admin_override_correction',
      'Normalize unresolved legacy therapist review to the current readiness lifecycle',
      auth.uid()
    );
    perform set_config('valorwell.relationship_projection_engine','on',true);

    begin
      update public.clients
      set primary_staff_id=null,
          lifecycle_stage=v_target,
          updated_at=clock_timestamp()
      where id=r.id;

      perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
      perform public.client_state_engine_restore_context(v_previous_state_context);
    exception when others then
      perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
      perform public.client_state_engine_restore_context(v_previous_state_context);
      raise;
    end;

    perform private.evaluate_client_provider_demand(
      r.id,
      'legacy_review_lifecycle_normalization',
      false
    );
    perform public.trg_enqueue_clickup_sync(r.id);

    if v_target::text='matching' then
      v_matching := v_matching + 1;
    else
      v_intake := v_intake + 1;
    end if;
  end loop;

  perform private.evaluate_client_journey_exceptions();

  return jsonb_build_object(
    'movedToIntake',v_intake,
    'movedToMatching',v_matching,
    'unchanged',v_unchanged,
    'completedAt',clock_timestamp(),
    'contractVersion','legacy-review-lifecycle-normalization.v1',
    'clientActionId',trim(p_client_action_id)
  );
end
$function$;

revoke all on function public.admin_normalize_legacy_review_lifecycle(text) from public,anon,authenticated;
grant execute on function public.admin_normalize_legacy_review_lifecycle(text) to service_role;
