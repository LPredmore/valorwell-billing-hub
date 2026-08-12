create or replace function private.legacy_relationship_evidence(
  p_client_id uuid,
  p_staff_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'appointment_count',(select count(*) from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text<>'cancelled'),
    'future_appointment_count',(select count(*) from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text='scheduled' and a.start_at>clock_timestamp()),
    'documented_appointment_count',(select count(*) from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.documented_at is not null),
    'signed_note_count',(select count(*) from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at is not null),
    'active_treatment_plan',exists(select 1 from public.client_treatment_plans tp where tp.client_id=p_client_id and tp.staff_id=p_staff_id and tp.is_active),
    'latest_care_at',greatest(
      (select max(a.start_at) from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text<>'cancelled'),
      (select max(n.signed_at) from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at is not null),
      (select max(tp.updated_at) from public.client_treatment_plans tp where tp.client_id=p_client_id and tp.staff_id=p_staff_id)
    ),
    'has_current_care_evidence',(
      exists(select 1 from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text='scheduled' and a.start_at>clock_timestamp())
      or exists(select 1 from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text<>'cancelled' and a.start_at>=clock_timestamp()-interval '120 days')
      or exists(select 1 from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at>=clock_timestamp()-interval '120 days')
      or exists(select 1 from public.client_treatment_plans tp where tp.client_id=p_client_id and tp.staff_id=p_staff_id and tp.is_active and tp.updated_at>=clock_timestamp()-interval '180 days')
    ),
    'has_any_care_evidence',(
      exists(select 1 from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text<>'cancelled')
      or exists(select 1 from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at is not null)
      or exists(select 1 from public.client_treatment_plans tp where tp.client_id=p_client_id and tp.staff_id=p_staff_id)
    )
  )
$$;
revoke all on function private.legacy_relationship_evidence(uuid,uuid) from public,anon,authenticated;

create or replace function public.admin_preview_legacy_relationship_containment()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_rows jsonb;
  v_summary jsonb;
begin
  if not private.therapist_match_admin_authorized() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;

  with candidates as (
    select
      r.id as relationship_id,r.client_id,r.staff_id,r.source,r.version,
      concat_ws(' ',c.pat_name_f,c.pat_name_l) as client_name,c.email,
      coalesce(s.prov_name_for_clients,nullif(trim(concat_ws(' ',s.prov_name_f,s.prov_name_l)),''),'Therapist') as staff_name,
      s.prov_accepting_new_clients,c.lifecycle_stage::text as lifecycle_stage,
      private.legacy_relationship_evidence(r.client_id,r.staff_id) as evidence
    from public.client_staff_relationships r
    join public.clients c on c.id=r.client_id and c.tenant_id=r.tenant_id
    join public.staff s on s.id=r.staff_id and s.tenant_id=r.tenant_id
    where r.relationship_type='primary_therapist'
      and r.ended_at is null
      and r.confirmation_state='confirmed'
      and r.source='phase6_primary_assignment_backfill'
  ), classified as (
    select *,case
      when (evidence->>'has_current_care_evidence')::boolean then 'strong_current_care'
      when (evidence->>'has_any_care_evidence')::boolean then 'historical_care_uncertain'
      else 'no_care_evidence'
    end as classification
    from candidates
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'relationshipId',relationship_id,'clientId',client_id,'clientName',client_name,'email',email,
      'staffId',staff_id,'staffName',staff_name,'staffAcceptingNewClients',prov_accepting_new_clients,
      'lifecycleStage',lifecycle_stage,'classification',classification,'evidence',evidence,'version',version
    ) order by classification,client_name,relationship_id),'[]'::jsonb),
    jsonb_build_object(
      'total',count(*),
      'strongCurrentCare',count(*) filter(where classification='strong_current_care'),
      'historicalCareUncertain',count(*) filter(where classification='historical_care_uncertain'),
      'noCareEvidence',count(*) filter(where classification='no_care_evidence')
    )
  into v_rows,v_summary
  from classified;

  return jsonb_build_object(
    'summary',v_summary,'rows',v_rows,'generatedAt',clock_timestamp(),
    'contractVersion','legacy-containment-preview.v1'
  );
end
$$;
revoke all on function public.admin_preview_legacy_relationship_containment() from public,anon;
grant execute on function public.admin_preview_legacy_relationship_containment() to authenticated,service_role;

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
      perform set_config('valorwell.relationship_projection_engine','on',true);
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
        update public.clients set primary_staff_id=null,updated_at=clock_timestamp() where id=r.client_id;
        v_historical:=v_historical+1;
      end if;
      perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
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
    'contractVersion','legacy-containment-apply.v1'
  );
exception when others then
  if v_previous_projection is not null then
    perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
  end if;
  raise;
end
$$;
revoke all on function public.admin_apply_legacy_relationship_containment(text) from public,anon;
grant execute on function public.admin_apply_legacy_relationship_containment(text) to authenticated,service_role;
