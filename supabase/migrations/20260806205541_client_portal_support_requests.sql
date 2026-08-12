create table if not exists public.client_support_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  client_id uuid not null references public.clients(id),
  category text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open','in_progress','resolved','cancelled')),
  crm_task_id uuid references public.crm_tasks(id),
  idempotency_key text not null,
  authority_snapshot jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid not null,
  resolved_at timestamptz,
  resolved_by_profile_id uuid,
  resolution_note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index if not exists client_support_requests_idempotency_uidx
  on public.client_support_requests (tenant_id,idempotency_key);
create index if not exists client_support_requests_client_status_idx
  on public.client_support_requests (client_id,status,created_at desc);
create index if not exists client_support_requests_crm_task_idx
  on public.client_support_requests (crm_task_id)
  where crm_task_id is not null;

alter table public.client_support_requests enable row level security;
revoke all on table public.client_support_requests from public,anon,authenticated;

create or replace function public.request_client_support(
  p_category text,
  p_message text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid := public.current_client_id();
  v_client public.clients%rowtype;
  v_existing public.client_support_requests%rowtype;
  v_request_id uuid;
  v_task_id uuid;
  v_authority jsonb;
  v_title text;
  v_priority public.crm_task_priority_enum := 'normal';
  v_type public.crm_task_type_enum := 'client_follow_up';
begin
  if v_actor is null or v_client_id is null then
    raise exception 'Authentication is required' using errcode='42501';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'A stable idempotency key is required' using errcode='22023';
  end if;
  if p_category is null or length(trim(p_category)) < 3 then
    raise exception 'Support category is required' using errcode='22023';
  end if;
  if p_message is null or length(trim(p_message)) < 10 then
    raise exception 'Please provide enough detail for the support team' using errcode='22023';
  end if;
  if length(p_message) > 4000 then
    raise exception 'Support message is too long' using errcode='22023';
  end if;

  select * into v_client
  from public.clients
  where id=v_client_id;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;

  select * into v_existing
  from public.client_support_requests
  where tenant_id=v_client.tenant_id
    and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object(
      'success',true,
      'idempotent',true,
      'request_id',v_existing.id,
      'task_id',v_existing.crm_task_id,
      'status',v_existing.status,
      'created_at',v_existing.created_at
    );
  end if;

  v_authority := public.get_current_client_therapist_authority();
  v_title := case
    when p_category in ('therapist_status','therapist_selection','scheduling')
      then 'Client portal therapist support request'
    when p_category='portal_access'
      then 'Client portal access support request'
    else 'Client portal support request'
  end;
  if p_category in ('therapist_status','therapist_selection','scheduling','portal_access') then
    v_priority := 'high';
  end if;
  if p_category in ('therapist_status','therapist_selection','scheduling') then
    v_type := 'match_review';
  end if;

  insert into public.crm_tasks (
    tenant_id,title,description,client_id,type,priority,status,
    created_by_profile_id,start_at,due_at,tags
  ) values (
    v_client.tenant_id,
    v_title,
    concat(
      'Client-submitted portal request. Category: ',trim(p_category),E'\n\n',trim(p_message),
      E'\n\nTherapist authority: ',coalesce(v_authority->>'relationship_state','unknown'),
      ' / ',coalesce(v_authority->>'match_state','unknown')
    ),
    v_client.id,
    v_type,
    v_priority,
    'not_started',
    v_actor,
    clock_timestamp(),
    clock_timestamp()+case when v_priority='high' then interval '1 business day' else interval '2 days' end,
    array['client-portal','support-request',trim(p_category)]::text[]
  ) returning id into v_task_id;

  insert into public.client_support_requests (
    tenant_id,client_id,category,message,status,crm_task_id,
    idempotency_key,authority_snapshot,created_by_profile_id
  ) values (
    v_client.tenant_id,v_client.id,trim(p_category),trim(p_message),'open',v_task_id,
    p_idempotency_key,v_authority,v_actor
  ) returning id into v_request_id;

  perform public.trg_enqueue_clickup_sync(v_client.id);

  return jsonb_build_object(
    'success',true,
    'idempotent',false,
    'request_id',v_request_id,
    'task_id',v_task_id,
    'status','open',
    'created_at',clock_timestamp()
  );
end
$$;

revoke all on function public.request_client_support(text,text,text) from public,anon;
grant execute on function public.request_client_support(text,text,text) to authenticated,service_role;
