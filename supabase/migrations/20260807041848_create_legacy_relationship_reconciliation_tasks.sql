create or replace function public.complete_legacy_relationship_review_task()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if old.confirmation_state='legacy_review'
     and new.confirmation_state in ('confirmed','rejected') then
    update public.crm_tasks
    set status='completed'::public.crm_task_status_enum,
        completed_at=coalesce(completed_at,clock_timestamp()),
        updated_at=clock_timestamp()
    where status in ('not_started','in_progress','waiting','blocked')
      and 'legacy-review'=any(tags)
      and concat('legacy-relationship:',new.id::text)=any(tags);
  end if;
  return new;
end
$function$;

revoke all on function public.complete_legacy_relationship_review_task() from public,anon,authenticated;

 drop trigger if exists complete_legacy_relationship_review_task_trigger on public.client_staff_relationships;
create trigger complete_legacy_relationship_review_task_trigger
after update of confirmation_state on public.client_staff_relationships
for each row
execute function public.complete_legacy_relationship_review_task();

do $migration$
declare
  v_owner uuid;
begin
  select ur.user_id into v_owner
  from public.user_roles ur
  where ur.role='admin'
  order by ur.user_id
  limit 1;

  if v_owner is null then
    raise exception 'No authoritative admin owner is available for reconciliation tasks';
  end if;

  insert into public.crm_tasks(
    tenant_id,title,description,client_id,staff_id,type,priority,status,
    owner_id,created_by_profile_id,start_at,due_at,tags,checklist
  )
  select
    rel.tenant_id,
    'Review legacy therapist relationship',
    concat(
      'Determine whether the historical therapist association represents a current active care relationship. ',
      'Confirm only with current-care evidence; otherwise reject and complete client follow-up. ',
      'Relationship ID: ',rel.id::text
    ),
    rel.client_id,
    rel.staff_id,
    'match_review'::public.crm_task_type_enum,
    'high'::public.crm_task_priority_enum,
    'not_started'::public.crm_task_status_enum,
    v_owner,
    v_owner,
    clock_timestamp(),
    clock_timestamp()+interval '2 days',
    array[
      'legacy-reconciliation',
      'legacy-review',
      concat('legacy-relationship:',rel.id::text)
    ]::text[],
    jsonb_build_array(
      jsonb_build_object('label','Review appointments, signed notes, and treatment plans','completed',false),
      jsonb_build_object('label','Verify whether the relationship is current','completed',false),
      jsonb_build_object('label','Confirm or reject with documented rationale','completed',false)
    )
  from public.client_staff_relationships rel
  join public.client_therapist_matches m
    on m.id=rel.match_id
   and m.state='legacy_review'
  where rel.relationship_type='primary_therapist'
    and rel.ended_at is null
    and rel.confirmation_state='legacy_review'
    and not exists (
      select 1
      from public.crm_tasks t
      where concat('legacy-relationship:',rel.id::text)=any(t.tags)
        and 'legacy-review'=any(t.tags)
        and t.status in ('not_started','in_progress','waiting','blocked')
    );
end
$migration$;
