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
      or exists(select 1 from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.documented_at is not null and greatest(a.start_at,a.documented_at)>=clock_timestamp()-interval '120 days')
      or exists(select 1 from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at>=clock_timestamp()-interval '120 days')
      or (
        exists(select 1 from public.client_treatment_plans tp where tp.client_id=p_client_id and tp.staff_id=p_staff_id and tp.is_active and tp.updated_at>=clock_timestamp()-interval '180 days')
        and (
          exists(select 1 from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.documented_at is not null)
          or exists(select 1 from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at is not null)
        )
      )
    ),
    'has_any_care_evidence',(
      exists(select 1 from public.appointments a where a.client_id=p_client_id and a.staff_id=p_staff_id and a.status::text<>'cancelled')
      or exists(select 1 from public.appointment_clinical_notes n where n.client_id=p_client_id and n.staff_id=p_staff_id and n.signed_at is not null)
      or exists(select 1 from public.client_treatment_plans tp where tp.client_id=p_client_id and tp.staff_id=p_staff_id)
    )
  )
$$;
revoke all on function private.legacy_relationship_evidence(uuid,uuid) from public,anon,authenticated;
