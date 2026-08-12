create or replace function private.client_therapist_authority_overlay(
  p_client_id uuid,
  p_base jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_client public.clients%rowtype;
  v_relationship public.client_staff_relationships%rowtype;
  v_match public.client_therapist_matches%rowtype;
  v_result jsonb:=coalesce(p_base,'{}'::jsonb);
  v_relationship_state text:='none';
  v_match_state text:='none';
  v_can_message boolean:=false;
  v_can_select boolean:=false;
  v_can_book_first boolean:=false;
  v_can_view_slots boolean:=false;
  v_can_self_schedule boolean:=false;
  v_therapist_id uuid;
  v_next_action jsonb;
begin
  select * into v_client from public.clients where id=p_client_id;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;

  select * into v_relationship
  from public.client_staff_relationships
  where client_id=v_client.id
    and relationship_type='primary_therapist'
    and ended_at is null
  order by created_at desc
  limit 1;

  select * into v_match
  from public.client_therapist_matches
  where client_id=v_client.id
    and state in ('legacy_review','pending_clinician_acceptance','pending_first_appointment')
  order by created_at desc
  limit 1;

  if v_relationship.id is not null then
    v_relationship_state:=v_relationship.confirmation_state::text;
  end if;
  if v_match.id is not null then v_match_state:=v_match.state::text; end if;

  v_can_message:=v_relationship.id is not null and v_relationship.confirmation_state='confirmed';
  v_can_book_first:=v_match.id is not null
    and v_match.state='pending_first_appointment'
    and (v_match.expires_at is null or v_match.expires_at>clock_timestamp());
  v_can_view_slots:=v_can_book_first or (
    v_relationship.id is not null
    and v_relationship.confirmation_state='confirmed'
    and coalesce((v_result->>'can_view_slots')::boolean,false)
  );
  v_can_self_schedule:=v_can_book_first or (
    v_relationship.id is not null
    and v_relationship.confirmation_state='confirmed'
    and coalesce((v_result->>'can_self_schedule')::boolean,false)
  );
  v_can_select:=v_match.id is null
    and v_relationship.id is null
    and coalesce((v_result->>'can_select_therapist')::boolean,false);
  v_therapist_id:=case
    when v_relationship.id is not null then v_relationship.staff_id
    when v_match.id is not null then v_match.staff_id
    else null
  end;

  v_next_action:=case
    when v_relationship_state='legacy_review' or v_match_state='legacy_review' then
      jsonb_build_object(
        'code','therapist_status_review','title','Therapist status under review',
        'message','ValorWell is confirming whether the therapist listed in older records represents a current care relationship.',
        'action_label','Contact Support','target_tab','support','actionable',true,
        'lifecycle_stage',v_client.lifecycle_stage,'future_appointment_start',null,
        'reactivation_request_id',null,'insurance_status_code',null,
        'evaluated_at',clock_timestamp(),'contract_version','therapist-authority.v1'
      )
    when v_match_state='pending_clinician_acceptance' then
      jsonb_build_object(
        'code','therapist_confirmation_pending','title','Awaiting therapist confirmation',
        'message','The selected therapist must accept before the relationship becomes active.',
        'action_label','View Therapist Status','target_tab','therapist','actionable',true,
        'lifecycle_stage',v_client.lifecycle_stage,'future_appointment_start',null,
        'reactivation_request_id',null,'insurance_status_code',null,
        'evaluated_at',clock_timestamp(),'contract_version','therapist-authority.v1'
      )
    when v_match_state='pending_first_appointment' then
      jsonb_build_object(
        'code','first_appointment_required','title','Choose your first appointment',
        'message','The therapist is reserved while you choose a first appointment. The relationship activates only when booking succeeds.',
        'action_label','Choose Appointment','target_tab','dashboard','actionable',true,
        'lifecycle_stage',v_client.lifecycle_stage,'future_appointment_start',null,
        'reactivation_request_id',null,'insurance_status_code',null,
        'evaluated_at',clock_timestamp(),'contract_version','therapist-authority.v1'
      )
    else v_result->'next_action'
  end;

  v_result:=v_result||jsonb_build_object(
    'initiate_message',v_can_message,
    'can_message_assigned_therapist',v_can_message,
    'select_therapist',v_can_select,
    'can_select_therapist',v_can_select,
    'view_slots',v_can_view_slots,
    'can_view_slots',v_can_view_slots,
    'book_appointment',v_can_self_schedule,
    'can_self_schedule',v_can_self_schedule,
    'can_book_first_appointment',v_can_book_first,
    'can_cancel_match',v_match.id is not null and v_match.state in ('pending_clinician_acceptance','pending_first_appointment'),
    'can_contact_support',true,
    'next_action',v_next_action,
    'contract_version','v5'
  );

  v_result:=jsonb_set(v_result,'{reason_codes}',coalesce(v_result->'reason_codes','{}'::jsonb)||jsonb_build_object(
    'therapist_selection',case
      when v_relationship.id is not null then 'confirmed_or_review_relationship_exists'
      when v_match.id is not null then v_match.state::text
      else coalesce(v_result->'reason_codes'->>'therapist_selection','not_available')
    end,
    'self_scheduling',case
      when v_can_book_first then 'pending_first_appointment'
      when v_relationship_state='legacy_review' or v_match_state='legacy_review' then 'legacy_relationship_review'
      when v_match_state='pending_clinician_acceptance' then 'therapist_confirmation_pending'
      else coalesce(v_result->'reason_codes'->>'self_scheduling','not_available')
    end,
    'messaging',case
      when v_can_message then 'confirmed_relationship'
      when v_relationship_state='legacy_review' or v_match_state='legacy_review' then 'legacy_relationship_review'
      when v_match_state='pending_clinician_acceptance' then 'therapist_confirmation_pending'
      when v_match_state='pending_first_appointment' then 'first_appointment_not_booked'
      else 'no_confirmed_relationship'
    end
  ),true);

  v_result:=jsonb_set(v_result,'{context}',coalesce(v_result->'context','{}'::jsonb)||jsonb_build_object(
    'assigned_therapist_id',v_therapist_id,
    'relationship_id',v_relationship.id,
    'relationship_state',v_relationship_state,
    'relationship_confirmation_state',case when v_relationship.id is null then null else v_relationship.confirmation_state::text end,
    'match_id',v_match.id,
    'match_state',v_match_state,
    'match_expires_at',v_match.expires_at,
    'match_scheduling_branch',v_match.scheduling_branch
  ),true);

  return v_result;
end
$$;
revoke all on function private.client_therapist_authority_overlay(uuid,jsonb) from public,anon,authenticated;

create or replace function private.client_action_contract(p_client_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select private.client_therapist_authority_overlay(
    p_client_id,
    private.client_pass4_action_overlay(
      p_client_id,
      private.client_appointment_action_overlay(
        p_client_id,
        private.client_action_contract_core(p_client_id)
      )
    )
  )
$$;

-- A client can send only to the staff member on a confirmed active primary relationship.
drop policy if exists "Clients can send messages" on public.messages;
create policy "Clients can send messages"
  on public.messages
  for insert to authenticated
  with check (
    sender_type='client'
    and sender_id=(select auth.uid())
    and exists (
      select 1
      from public.clients c
      join public.client_staff_relationships r
        on r.client_id=c.id
       and r.staff_id=messages.staff_id
       and r.relationship_type='primary_therapist'
       and r.ended_at is null
       and r.confirmation_state='confirmed'
      where c.id=messages.client_id
        and c.profile_id=(select auth.uid())
        and c.tenant_id=messages.tenant_id
    )
  );

-- Staff cannot impersonate another staff sender. Clinicians need a confirmed
-- relationship; administrators may send an operational message as themselves.
drop policy if exists "Staff can send messages" on public.messages;
create policy "Staff can send messages"
  on public.messages
  for insert to authenticated
  with check (
    sender_type='staff'
    and sender_id=(select auth.uid())
    and exists (
      select 1
      from public.staff sender_staff
      where sender_staff.id=messages.staff_id
        and sender_staff.profile_id=(select auth.uid())
        and sender_staff.tenant_id=messages.tenant_id
        and (
          private.therapist_match_admin_authorized()
          or exists (
            select 1
            from public.client_staff_relationships r
            where r.client_id=messages.client_id
              and r.staff_id=sender_staff.id
              and r.relationship_type='primary_therapist'
              and r.ended_at is null
              and r.confirmation_state='confirmed'
          )
        )
    )
  );
