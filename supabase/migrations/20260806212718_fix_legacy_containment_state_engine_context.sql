create or replace function public.admin_apply_legacy_relationship_containment(
  p_client_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_evidence jsonb;
  v_classification text;
  v_match_id uuid;
  v_previous_projection text;
  v_previous_state_context jsonb;
  v_readiness record;
  v_strong integer:=0;
  v_historical integer:=0;
  v_none integer:=0;
  v_skipped integer:=0;
begin
  if not private.therapist_match_admin_authorized() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_client_action_id,'')))<8 then
    raise exception 'A client action id is required' using errcode='22023';
  end if;

  for r in
    select rel.*
    from public.client_staff_relationships rel
    where rel.relationship_type='primary_therapist'
      and rel.ended_at is null
      and rel.confirmation_state='confirmed'
      and rel.source='phase6_primary_assignment_backfill'
    order by rel.client_id,rel.id
    for update skip locked
  loop
    v_evidence:=private.legacy_relationship_evidence(r.client_id,r.staff_id);
    v_classification:=case
      when (v_evidence->>'has_current_care_evidence')::boolean then 'strong_current_care'
      when (v_evidence->>'has_any_care_evidence')::boolean then 'historical_care_uncertain'
      else 'no_care_evidence'
    end;

    if exists(
      select 1 from public.client_therapist_matches m
      where m.tenant_id=r.tenant_id
        and m.idempotency_key=concat('legacy-reconciliation:',r.id::text)
    ) then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if v_classification='strong_current_care' then
      insert into public.client_therapist_matches(
        tenant_id,client_id,staff_id,state,scheduling_branch,initiation_source,
        initiated_by_profile_id,selected_at,activated_at,resolved_at,resolution_reason,
        eligibility_snapshot,capacity_reserved,idempotency_key
      ) values(
        r.tenant_id,r.client_id,r.staff_id,'activated',coalesce(r.scheduling_branch,'therapist_led'),
        'legacy_reconciliation_evidence',auth.uid(),r.started_at,clock_timestamp(),clock_timestamp(),
        'strong_current_care_evidence',v_evidence,false,concat('legacy-reconciliation:',r.id::text)
      ) returning id into v_match_id;

      update public.client_staff_relationships
      set match_id=v_match_id,activation_source='legacy_reconciliation_evidence_confirmed',
          activated_by_profile_id=auth.uid(),activation_evidence=coalesce(activation_evidence,'{}'::jsonb)||v_evidence||jsonb_build_object('classification',v_classification),
          confirmed_at=coalesce(confirmed_at,started_at),version=version+1,updated_at=clock_timestamp()
      where id=r.id;

      perform private.record_therapist_match_event(
        v_match_id,'legacy_relationship_evidence_confirmed',null,'activated',auth.uid(),
        'legacy_reconciliation','Strong current-care evidence confirmed the relationship',
        concat('legacy-event:',p_client_action_id,':',r.id::text),v_evidence,null
      );
      v_strong:=v_strong+1;
    else
      insert into public.client_therapist_matches(
        tenant_id,client_id,staff_id,state,scheduling_branch,initiation_source,
        initiated_by_profile_id,selected_at,eligibility_snapshot,capacity_reserved,idempotency_key
      ) values(
        r.tenant_id,r.client_id,r.staff_id,'legacy_review',coalesce(r.scheduling_branch,'therapist_led'),
        'legacy_migration_reconciliation',auth.uid(),r.started_at,
        v_evidence||jsonb_build_object('classification',v_classification),false,
        concat('legacy-reconciliation:',r.id::text)
      ) returning id into v_match_id;

      update public.client_staff_relationships
      set match_id=v_match_id,confirmation_state='legacy_review',
          activation_source='legacy_migration_reconciliation',activated_by_profile_id=auth.uid(),
          activation_evidence=coalesce(activation_evidence,'{}'::jsonb)||v_evidence||jsonb_build_object('classification',v_classification),
          version=version+1,updated_at=clock_timestamp()
      where id=r.id;

      perform private.record_therapist_match_event(
        v_match_id,'legacy_relationship_review_started',null,'legacy_review',auth.uid(),
        'legacy_reconciliation',concat('Legacy relationship entered review: ',v_classification),
        concat('legacy-event:',p_client_action_id,':',r.id::text),v_evidence,null
      );

      v_previous_projection:=current_setting('valorwell.relationship_projection_engine',true);
      v_previous_state_context:=public.client_state_engine_begin_context(
        'admin_override_correction',
        concat('Legacy therapist relationship containment: ',v_classification),
        auth.uid()
      );
      perform set_config('valorwell.relationship_projection_engine','on',true);
      begin
        if v_classification='no_care_evidence' then
          select * into v_readiness from private.client_care_readiness(r.client_id);
          update public.clients
          set primary_staff_id=null,
              lifecycle_stage=case
                when lifecycle_stage::text='closed' then lifecycle_stage
                when v_readiness.therapist_selection_ready is true then 'matching'::public.client_lifecycle_stage_enum
                else 'intake'::public.client_lifecycle_stage_enum
              end,
              updated_at=clock_timestamp()
          where id=r.client_id;
          perform private.evaluate_client_provider_demand(r.client_id,'legacy_relationship_containment',true);
          v_none:=v_none+1;
        else
          update public.clients
          set primary_staff_id=null,updated_at=clock_timestamp()
          where id=r.client_id;
          v_historical:=v_historical+1;
        end if;
        perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
        perform public.client_state_engine_restore_context(v_previous_state_context);
      exception when others then
        perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
        perform public.client_state_engine_restore_context(v_previous_state_context);
        raise;
      end;
    end if;

    perform public.trg_enqueue_clickup_sync(r.client_id);
  end loop;

  perform private.evaluate_client_journey_exceptions();

  return jsonb_build_object(
    'strongCurrentCareConfirmed',v_strong,
    'historicalCareMovedToReview',v_historical,
    'noCareMovedToReview',v_none,
    'skippedIdempotent',v_skipped,
    'completedAt',clock_timestamp(),
    'contractVersion','legacy-containment-apply.v2'
  );
end
$$;

revoke all on function public.admin_apply_legacy_relationship_containment(text) from public,anon;
grant execute on function public.admin_apply_legacy_relationship_containment(text) to authenticated,service_role;
