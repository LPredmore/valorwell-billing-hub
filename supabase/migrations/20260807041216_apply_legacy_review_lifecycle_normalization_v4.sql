do $migration$
declare
  r record;
  v_readiness record;
  v_target public.client_lifecycle_stage_enum;
  v_previous_source text;
  v_previous_reason text;
  v_previous_actor text;
  v_previous_projection text;
begin
  for r in
    select c.id,c.lifecycle_stage
    from public.clients c
    where c.lifecycle_stage::text <> 'closed'
      and exists (
        select 1
        from public.client_staff_relationships rel
        join public.client_therapist_matches m
          on m.id=rel.match_id
         and m.state='legacy_review'
        where rel.client_id=c.id
          and rel.relationship_type='primary_therapist'
          and rel.ended_at is null
          and rel.confirmation_state='legacy_review'
      )
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
      continue;
    end if;

    v_previous_source := current_setting('valorwell.client_state_source',true);
    v_previous_reason := current_setting('valorwell.client_state_reason',true);
    v_previous_actor := current_setting('valorwell.client_state_actor_id',true);
    v_previous_projection := current_setting('valorwell.relationship_projection_engine',true);

    perform set_config('valorwell.client_state_source','migration_backfill',true);
    perform set_config('valorwell.client_state_reason','Normalize unresolved legacy therapist review to the current readiness lifecycle',true);
    perform set_config('valorwell.client_state_actor_id','',true);
    perform set_config('valorwell.relationship_projection_engine','on',true);

    begin
      update public.clients
      set primary_staff_id=null,
          lifecycle_stage=v_target,
          updated_at=clock_timestamp()
      where id=r.id;

      perform set_config('valorwell.client_state_source',coalesce(v_previous_source,''),true);
      perform set_config('valorwell.client_state_reason',coalesce(v_previous_reason,''),true);
      perform set_config('valorwell.client_state_actor_id',coalesce(v_previous_actor,''),true);
      perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
    exception when others then
      perform set_config('valorwell.client_state_source',coalesce(v_previous_source,''),true);
      perform set_config('valorwell.client_state_reason',coalesce(v_previous_reason,''),true);
      perform set_config('valorwell.client_state_actor_id',coalesce(v_previous_actor,''),true);
      perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
      raise;
    end;

    perform private.evaluate_client_provider_demand(
      r.id,
      'legacy_review_lifecycle_normalization',
      false
    );
    perform public.trg_enqueue_clickup_sync(r.id);
  end loop;

  perform private.evaluate_client_journey_exceptions();
end
$migration$;
