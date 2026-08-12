create index if not exists client_staff_relationships_match_id_idx
  on public.client_staff_relationships(match_id)
  where match_id is not null;

create index if not exists client_staff_relationships_first_appointment_idx
  on public.client_staff_relationships(first_scheduled_appointment_id)
  where first_scheduled_appointment_id is not null;

create index if not exists client_therapist_match_events_client_idx
  on public.client_therapist_match_events(client_id, occurred_at desc);

create index if not exists client_therapist_match_events_staff_idx
  on public.client_therapist_match_events(staff_id, occurred_at desc);
