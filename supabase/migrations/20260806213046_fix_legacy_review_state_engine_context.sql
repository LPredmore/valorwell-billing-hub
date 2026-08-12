create or replace function public.confirm_legacy_therapist_relationship(
  p_relationship_id uuid,
  p_reason text,
  p_prior_version bigint,
  p_client_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_relationship public.client_staff_relationships%rowtype;
  v_client public.clients%rowtype;
  v_previous_projection text;
  v_previous_state_context jsonb;
  v_evidence jsonb;
begin
  if not private.therapist_match_admin_authorized() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A meaningful confirmation reason is required' using errcode='22023'; end if;
  if length(trim(coalesce(p_client_action_id,'')))<8 then raise exception 'A client action id is required' using errcode='22023'; end if;

  select * into v_relationship from public.client_staff_relationships where id=p_relationship_id for update;
  if not found then raise exception 'Relationship not found' using errcode='P0002'; end if;
  if v_relationship.confirmation_state='confirmed' then
    return jsonb_build_object('success',true,'idempotent',true,'relationshipId',v_relationship.id,'state','confirmed','version',v_relationship.version);
  end if;
  if v_relationship.confirmation_state<>'legacy_review' or v_relationship.ended_at is not null then
    raise exception 'Relationship is not an active legacy review' using errcode='22023';
  end if;
  if v_relationship.version<>p_prior_version then raise exception 'Relationship changed; refresh and retry' using errcode='40001'; end if;

  select * into v_client from public.clients where id=v_relationship.client_id for update;
  v_evidence:=jsonb_build_object(
    'appointment_count',(select count(*) from public.appointments a where a.client_id=v_relationship.client_id and a.staff_id=v_relationship.staff_id and a.status::text<>'cancelled'),
    'documented_appointment_count',(select count(*) from public.appointments a where a.client_id=v_relationship.client_id and a.staff_id=v_relationship.staff_id and a.documented_at is not null),
    'signed_note_count',(select count(*) from public.appointment_clinical_notes n where n.client_id=v_relationship.client_id and n.staff_id=v_relationship.staff_id and n.signed_at is not null),
    'active_treatment_plan',exists(select 1 from public.client_treatment_plans tp where tp.client_id=v_relationship.client_id and tp.staff_id=v_relationship.staff_id and tp.is_active),
    'review_reason',trim(p_reason),'reviewed_at',clock_timestamp()
  );

  update public.client_staff_relationships
  set confirmation_state='confirmed',activation_source='legacy_reconciliation_confirmed',
      activated_by_profile_id=v_actor,activation_evidence=coalesce(activation_evidence,'{}'::jsonb)||v_evidence,
      confirmed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
  where id=v_relationship.id;

  if v_relationship.match_id is not null then
    update public.client_therapist_matches
    set state='activated',activated_at=clock_timestamp(),resolved_at=clock_timestamp(),
        resolution_reason='legacy_relationship_confirmed',version=version+1,updated_at=clock_timestamp()
    where id=v_relationship.match_id and state='legacy_review';
    perform private.record_therapist_match_event(
      v_relationship.match_id,'legacy_relationship_confirmed','legacy_review','activated',v_actor,
      'legacy_reconciliation',trim(p_reason),concat('legacy-confirm:',p_client_action_id),v_evidence,null
    );
  end if;

  v_previous_projection:=current_setting('valorwell.relationship_projection_engine',true);
  v_previous_state_context:=public.client_state_engine_begin_context(
    'admin_override_correction',
    trim(p_reason),
    v_actor
  );
  perform set_config('valorwell.relationship_projection_engine','on',true);
  begin
    update public.clients
    set primary_staff_id=v_relationship.staff_id,
        lifecycle_stage=case when lifecycle_stage::text in ('intake','matching') then 'matched'::public.client_lifecycle_stage_enum else lifecycle_stage end,
        updated_at=clock_timestamp()
    where id=v_relationship.client_id;
    perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
    perform public.client_state_engine_restore_context(v_previous_state_context);
  exception when others then
    perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
    perform public.client_state_engine_restore_context(v_previous_state_context);
    raise;
  end;

  update public.client_provider_demand
  set resolved_at=coalesce(resolved_at,clock_timestamp()),resolution_reason='legacy_relationship_confirmed',
      last_evaluated_at=clock_timestamp(),last_evaluation_source='legacy_reconciliation',updated_at=clock_timestamp(),version=version+1
  where client_id=v_relationship.client_id and resolved_at is null;

  perform public.trg_enqueue_clickup_sync(v_relationship.client_id);
  return jsonb_build_object('success',true,'idempotent',false,'relationshipId',v_relationship.id,'state','confirmed','version',v_relationship.version+1);
end
$$;
revoke all on function public.confirm_legacy_therapist_relationship(uuid,text,bigint,text) from public,anon;
grant execute on function public.confirm_legacy_therapist_relationship(uuid,text,bigint,text) to authenticated,service_role;

create or replace function public.reject_legacy_therapist_relationship(
  p_relationship_id uuid,
  p_reason text,
  p_prior_version bigint,
  p_client_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_relationship public.client_staff_relationships%rowtype;
  v_client public.clients%rowtype;
  v_readiness record;
  v_previous_projection text;
  v_previous_state_context jsonb;
  v_task_id uuid;
begin
  if not private.therapist_match_admin_authorized() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A meaningful rejection reason is required' using errcode='22023'; end if;
  if length(trim(coalesce(p_client_action_id,'')))<8 then raise exception 'A client action id is required' using errcode='22023'; end if;

  select * into v_relationship from public.client_staff_relationships where id=p_relationship_id for update;
  if not found then raise exception 'Relationship not found' using errcode='P0002'; end if;
  if v_relationship.confirmation_state='rejected' or v_relationship.ended_at is not null then
    return jsonb_build_object('success',true,'idempotent',true,'relationshipId',v_relationship.id,'state','rejected','version',v_relationship.version);
  end if;
  if v_relationship.confirmation_state<>'legacy_review' then raise exception 'Relationship is not under legacy review' using errcode='22023'; end if;
  if v_relationship.version<>p_prior_version then raise exception 'Relationship changed; refresh and retry' using errcode='40001'; end if;

  select * into v_client from public.clients where id=v_relationship.client_id for update;
  select * into v_readiness from private.client_care_readiness(v_relationship.client_id);

  update public.client_staff_relationships
  set confirmation_state='rejected',ended_at=clock_timestamp(),end_reason='legacy_relationship_unconfirmed',
      activation_evidence=coalesce(activation_evidence,'{}'::jsonb)||jsonb_build_object('rejection_reason',trim(p_reason),'reviewed_at',clock_timestamp()),
      version=version+1,updated_at=clock_timestamp()
  where id=v_relationship.id;

  if v_relationship.match_id is not null then
    update public.client_therapist_matches
    set state='invalidated',resolved_at=clock_timestamp(),resolution_reason='legacy_relationship_unconfirmed',
        capacity_reserved=false,version=version+1,updated_at=clock_timestamp()
    where id=v_relationship.match_id and state='legacy_review';
    perform private.record_therapist_match_event(
      v_relationship.match_id,'legacy_relationship_rejected','legacy_review','invalidated',v_actor,
      'legacy_reconciliation',trim(p_reason),concat('legacy-reject:',p_client_action_id),'{}'::jsonb,null
    );
  end if;

  v_previous_projection:=current_setting('valorwell.relationship_projection_engine',true);
  v_previous_state_context:=public.client_state_engine_begin_context(
    'admin_override_correction',
    trim(p_reason),
    v_actor
  );
  perform set_config('valorwell.relationship_projection_engine','on',true);
  begin
    update public.clients
    set primary_staff_id=null,
        lifecycle_stage=case
          when lifecycle_stage::text='closed' then lifecycle_stage
          when v_readiness.therapist_selection_ready is true then 'matching'::public.client_lifecycle_stage_enum
          else 'intake'::public.client_lifecycle_stage_enum
        end,
        updated_at=clock_timestamp()
    where id=v_relationship.client_id;
    perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
    perform public.client_state_engine_restore_context(v_previous_state_context);
  exception when others then
    perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);
    perform public.client_state_engine_restore_context(v_previous_state_context);
    raise;
  end;

  perform private.evaluate_client_provider_demand(v_relationship.client_id,'legacy_relationship_rejected',true);

  insert into public.crm_tasks(tenant_id,title,description,client_id,type,priority,status,created_by_profile_id,start_at,due_at,tags)
  values(
    v_relationship.tenant_id,'Legacy therapist relationship rejected',
    concat('The legacy therapist association was rejected after review. Human follow-up is required. Reason: ',trim(p_reason)),
    v_relationship.client_id,'match_review','high','not_started',v_actor,clock_timestamp(),clock_timestamp()+interval '1 day',
    array['legacy-reconciliation','client-follow-up']::text[]
  ) returning id into v_task_id;

  perform public.trg_enqueue_clickup_sync(v_relationship.client_id);
  return jsonb_build_object('success',true,'idempotent',false,'relationshipId',v_relationship.id,'state','rejected','version',v_relationship.version+1,'taskId',v_task_id);
end
$$;
revoke all on function public.reject_legacy_therapist_relationship(uuid,text,bigint,text) from public,anon;
grant execute on function public.reject_legacy_therapist_relationship(uuid,text,bigint,text) to authenticated,service_role;
