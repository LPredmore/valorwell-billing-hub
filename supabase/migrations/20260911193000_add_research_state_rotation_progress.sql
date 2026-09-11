alter table public.research_state_rotations
  add column if not exists progress jsonb not null default '{}'::jsonb;

comment on column public.research_state_rotations.progress is
  'Workflow-specific resumable progress for the currently claimed state, such as source page and result position. State rotation remains controlled by the canonical rotation functions.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_state_rotations_progress_object_check'
      and conrelid = 'public.research_state_rotations'::regclass
  ) then
    alter table public.research_state_rotations
      add constraint research_state_rotations_progress_object_check
      check (jsonb_typeof(progress) = 'object');
  end if;
end
$$;

create or replace function private.set_research_state_rotation_progress(
  p_tenant_id uuid,
  p_workflow_key text,
  p_expected_state_order smallint,
  p_progress jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.research_state_rotations%rowtype;
begin
  if p_tenant_id is null or nullif(btrim(p_workflow_key), '') is null then
    raise exception 'tenant_id and workflow_key are required';
  end if;

  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then
    raise exception 'progress must be a JSON object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'research_state_rotation:' || p_tenant_id::text || ':' || btrim(p_workflow_key),
      0
    )
  );

  select * into r
  from public.research_state_rotations
  where tenant_id = p_tenant_id
    and workflow_key = btrim(p_workflow_key)
  for update;

  if not found or r.status <> 'in_progress' or r.current_state_order is null then
    raise exception 'no in-progress state rotation exists for workflow %', p_workflow_key;
  end if;

  if p_expected_state_order is null or p_expected_state_order <> r.current_state_order then
    raise exception 'state rotation mismatch: expected %, current %',
      p_expected_state_order, r.current_state_order;
  end if;

  update public.research_state_rotations
  set progress = p_progress,
      updated_at = now()
  where id = r.id
  returning * into r;

  return jsonb_build_object(
    'workflowKey', r.workflow_key,
    'cycleNumber', r.cycle_number,
    'stateOrder', r.current_state_order,
    'status', r.status,
    'progress', r.progress
  );
end;
$$;

revoke all on function private.set_research_state_rotation_progress(uuid, text, smallint, jsonb)
  from public, anon, authenticated;
grant execute on function private.set_research_state_rotation_progress(uuid, text, smallint, jsonb)
  to service_role;
