create or replace function private.therapist_match_admin_authorized()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.valorwell_is_admin()
    or exists (
      select 1
      from public.staff s
      join public.staff_role_assignments sra
        on sra.staff_id=s.id and sra.tenant_id=s.tenant_id
      join public.staff_roles sr on sr.id=sra.staff_role_id
      where s.profile_id=auth.uid()
        and sr.code in ('ADMIN','ACCOUNT_OWNER')
    )
$$;
revoke all on function private.therapist_match_admin_authorized() from public,anon,authenticated;

create or replace function public.staff_list_therapist_match_work(
  p_page integer default 1,
  p_page_size integer default 50,
  p_scope text default 'active',
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_staff_id uuid;
  v_tenant_id uuid;
  v_is_admin boolean:=private.therapist_match_admin_authorized();
  v_page integer:=greatest(coalesce(p_page,1),1);
  v_page_size integer:=least(greatest(coalesce(p_page_size,50),1),100);
  v_offset integer;
  v_rows jsonb;
  v_total bigint;
begin
  if v_uid is null or not private.valorwell_is_staff_or_admin() then
    raise exception 'Staff authentication is required' using errcode='42501';
  end if;

  select s.id,s.tenant_id into v_staff_id,v_tenant_id
  from public.staff s
  where s.profile_id=v_uid
  order by s.created_at nulls last
  limit 1;

  if v_staff_id is null or v_tenant_id is null then
    raise exception 'Staff record not found' using errcode='P0002';
  end if;

  if p_scope not in ('active','pending','legacy','all') then
    raise exception 'Unsupported therapist match work scope' using errcode='22023';
  end if;
  v_offset:=(v_page-1)*v_page_size;

  with work as (
    select
      'match'::text as work_type,
      m.id as work_id,
      m.id as match_id,
      null::uuid as relationship_id,
      m.client_id,
      concat_ws(' ',c.pat_name_f,c.pat_name_l) as client_display_name,
      c.email as client_email,
      c.pat_state::text as client_state,
      c.lifecycle_stage::text as lifecycle_stage,
      m.staff_id,
      coalesce(s.prov_name_for_clients,nullif(trim(concat_ws(' ',s.prov_name_f,s.prov_name_l)),''),'Therapist') as staff_display_name,
      m.state::text as state,
      m.scheduling_branch,
      m.initiation_source as source,
      m.selected_at as opened_at,
      m.expires_at,
      m.version,
      s.prov_status::text as staff_status,
      s.prov_accepting_new_clients,
      0::bigint as appointment_count,
      0::bigint as documented_appointment_count,
      0::bigint as signed_note_count,
      false as active_treatment_plan,
      null::timestamptz as latest_care_at,
      case
        when m.state='pending_clinician_acceptance' then 'accept_or_decline'
        when m.state='pending_first_appointment' then 'await_client_booking'
        else 'review_match'
      end as recommended_action
    from public.client_therapist_matches m
    join public.clients c on c.id=m.client_id and c.tenant_id=m.tenant_id
    join public.staff s on s.id=m.staff_id and s.tenant_id=m.tenant_id
    where m.tenant_id=v_tenant_id
      and m.state in ('pending_clinician_acceptance','pending_first_appointment')
      and (v_is_admin or m.staff_id=v_staff_id)

    union all

    select
      'legacy_relationship'::text,
      r.id,
      r.match_id,
      r.id,
      r.client_id,
      concat_ws(' ',c.pat_name_f,c.pat_name_l),
      c.email,
      c.pat_state::text,
      c.lifecycle_stage::text,
      r.staff_id,
      coalesce(s.prov_name_for_clients,nullif(trim(concat_ws(' ',s.prov_name_f,s.prov_name_l)),''),'Therapist'),
      r.confirmation_state::text,
      r.scheduling_branch,
      r.source,
      r.started_at,
      null::timestamptz,
      r.version,
      s.prov_status::text,
      s.prov_accepting_new_clients,
      ev.appointment_count,
      ev.documented_appointment_count,
      ev.signed_note_count,
      ev.active_treatment_plan,
      ev.latest_care_at,
      case
        when ev.has_current_care_evidence then 'confirm_or_review_current_care'
        when ev.has_any_care_evidence then 'manual_historical_review'
        else 'reject_unconfirmed_legacy_relationship'
      end
    from public.client_staff_relationships r
    join public.clients c on c.id=r.client_id and c.tenant_id=r.tenant_id
    join public.staff s on s.id=r.staff_id and s.tenant_id=r.tenant_id
    cross join lateral (
      select
        (select count(*) from public.appointments a where a.client_id=r.client_id and a.staff_id=r.staff_id and a.status::text<>'cancelled') as appointment_count,
        (select count(*) from public.appointments a where a.client_id=r.client_id and a.staff_id=r.staff_id and a.documented_at is not null) as documented_appointment_count,
        (select count(*) from public.appointment_clinical_notes n where n.client_id=r.client_id and n.staff_id=r.staff_id and n.signed_at is not null) as signed_note_count,
        exists(select 1 from public.client_treatment_plans tp where tp.client_id=r.client_id and tp.staff_id=r.staff_id and tp.is_active) as active_treatment_plan,
        greatest(
          (select max(a.start_at) from public.appointments a where a.client_id=r.client_id and a.staff_id=r.staff_id and a.status::text<>'cancelled'),
          (select max(n.signed_at) from public.appointment_clinical_notes n where n.client_id=r.client_id and n.staff_id=r.staff_id and n.signed_at is not null),
          (select max(tp.updated_at) from public.client_treatment_plans tp where tp.client_id=r.client_id and tp.staff_id=r.staff_id)
        ) as latest_care_at,
        (
          exists(select 1 from public.appointments a where a.client_id=r.client_id and a.staff_id=r.staff_id and a.status::text<>'cancelled' and a.start_at>=clock_timestamp()-interval '120 days')
          or exists(select 1 from public.appointment_clinical_notes n where n.client_id=r.client_id and n.staff_id=r.staff_id and n.signed_at>=clock_timestamp()-interval '120 days')
          or exists(select 1 from public.client_treatment_plans tp where tp.client_id=r.client_id and tp.staff_id=r.staff_id and tp.is_active and tp.updated_at>=clock_timestamp()-interval '180 days')
        ) as has_current_care_evidence,
        (
          exists(select 1 from public.appointments a where a.client_id=r.client_id and a.staff_id=r.staff_id and a.status::text<>'cancelled')
          or exists(select 1 from public.appointment_clinical_notes n where n.client_id=r.client_id and n.staff_id=r.staff_id and n.signed_at is not null)
          or exists(select 1 from public.client_treatment_plans tp where tp.client_id=r.client_id and tp.staff_id=r.staff_id)
        ) as has_any_care_evidence
    ) ev
    where r.tenant_id=v_tenant_id
      and r.relationship_type='primary_therapist'
      and r.ended_at is null
      and r.confirmation_state='legacy_review'
      and v_is_admin
  ), filtered as (
    select * from work w
    where
      (p_scope='all'
       or p_scope='active'
       or (p_scope='pending' and w.work_type='match')
       or (p_scope='legacy' and w.work_type='legacy_relationship'))
      and (
        nullif(trim(coalesce(p_search,'')),'') is null
        or w.client_display_name ilike '%'||trim(p_search)||'%'
        or w.client_email ilike '%'||trim(p_search)||'%'
        or w.staff_display_name ilike '%'||trim(p_search)||'%'
      )
  ), counted as (
    select *,count(*) over() as total_count
    from filtered
    order by
      case when state='pending_clinician_acceptance' then 0 when state='legacy_review' then 1 else 2 end,
      expires_at nulls last,
      opened_at,
      work_id
    offset v_offset limit v_page_size
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'workType',work_type,'id',work_id,'matchId',match_id,'relationshipId',relationship_id,
      'clientId',client_id,'clientDisplayName',client_display_name,'clientEmail',client_email,
      'clientState',client_state,'lifecycleStage',lifecycle_stage,'staffId',staff_id,
      'staffDisplayName',staff_display_name,'state',state,'schedulingBranch',scheduling_branch,
      'source',source,'openedAt',opened_at,'expiresAt',expires_at,'version',version,
      'staffStatus',staff_status,'staffAcceptingNewClients',prov_accepting_new_clients,
      'appointmentCount',appointment_count,'documentedAppointmentCount',documented_appointment_count,
      'signedNoteCount',signed_note_count,'activeTreatmentPlan',active_treatment_plan,
      'latestCareAt',latest_care_at,'recommendedAction',recommended_action
    ) order by
      case when state='pending_clinician_acceptance' then 0 when state='legacy_review' then 1 else 2 end,
      expires_at nulls last,opened_at,work_id),'[]'::jsonb),
    coalesce(max(total_count),0)
  into v_rows,v_total
  from counted;

  return jsonb_build_object(
    'rows',v_rows,'total',v_total,'page',v_page,'pageSize',v_page_size,
    'scope',p_scope,'isAdmin',v_is_admin,'contractVersion','therapist-match-work.v1'
  );
end
$$;
revoke all on function public.staff_list_therapist_match_work(integer,integer,text,text) from public,anon;
grant execute on function public.staff_list_therapist_match_work(integer,integer,text,text) to authenticated,service_role;

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
  perform set_config('valorwell.relationship_projection_engine','on',true);
  update public.clients
  set primary_staff_id=v_relationship.staff_id,
      lifecycle_stage=case when lifecycle_stage::text in ('intake','matching') then 'matched'::public.client_lifecycle_stage_enum else lifecycle_stage end,
      updated_at=clock_timestamp()
  where id=v_relationship.client_id;
  perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true);

  update public.client_provider_demand
  set resolved_at=coalesce(resolved_at,clock_timestamp()),resolution_reason='legacy_relationship_confirmed',
      last_evaluated_at=clock_timestamp(),last_evaluation_source='legacy_reconciliation',updated_at=clock_timestamp(),version=version+1
  where client_id=v_relationship.client_id and resolved_at is null;

  perform public.trg_enqueue_clickup_sync(v_relationship.client_id);
  return jsonb_build_object('success',true,'idempotent',false,'relationshipId',v_relationship.id,'state','confirmed','version',v_relationship.version+1);
exception when others then
  if v_previous_projection is not null then perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true); end if;
  raise;
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
  perform set_config('valorwell.relationship_projection_engine','on',true);
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
exception when others then
  if v_previous_projection is not null then perform set_config('valorwell.relationship_projection_engine',coalesce(v_previous_projection,''),true); end if;
  raise;
end
$$;
revoke all on function public.reject_legacy_therapist_relationship(uuid,text,bigint,text) from public,anon;
grant execute on function public.reject_legacy_therapist_relationship(uuid,text,bigint,text) to authenticated,service_role;
