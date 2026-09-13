create table if not exists private.homepage_documented_monthly_impact_snapshot (
  month date primary key,
  documented_appointments bigint not null check (documented_appointments >= 0),
  displayed_value bigint not null check (displayed_value >= 0),
  refreshed_at timestamptz not null
);

revoke all on private.homepage_documented_monthly_impact_snapshot from public, anon, authenticated;

create or replace function private.refresh_homepage_documented_monthly_impact_snapshot()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_refreshed_at timestamptz := clock_timestamp();
begin
  delete from private.homepage_documented_monthly_impact_snapshot;

  insert into private.homepage_documented_monthly_impact_snapshot (
    month,
    documented_appointments,
    displayed_value,
    refreshed_at
  )
  select
    date_trunc('month', a.start_at at time zone 'America/Chicago')::date as month,
    count(*)::bigint as documented_appointments,
    round(count(*)::numeric * 2.13)::bigint as displayed_value,
    v_refreshed_at
  from public.appointments a
  where a.status::text = 'documented'
    and a.start_at <= now()
  group by 1
  order by 1;
end;
$function$;

revoke all on function private.refresh_homepage_documented_monthly_impact_snapshot() from public, anon, authenticated;

create or replace function public.get_homepage_documented_monthly_impact()
returns table(month date, documented_appointments bigint, displayed_value bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    s.month,
    s.documented_appointments,
    s.displayed_value
  from private.homepage_documented_monthly_impact_snapshot s
  order by s.month;
$function$;

grant execute on function public.get_homepage_documented_monthly_impact() to anon, authenticated, service_role;

select private.refresh_homepage_documented_monthly_impact_snapshot();

do $block$
declare
  v_jobid bigint;
begin
  select jobid
    into v_jobid
  from cron.job
  where jobname = 'refresh-homepage-documented-impact-weekly'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end;
$block$;

select cron.schedule(
  'refresh-homepage-documented-impact-weekly',
  '0 5,6 * * 0',
  $cron$
    select private.refresh_homepage_documented_monthly_impact_snapshot()
    where extract(isodow from (clock_timestamp() at time zone 'America/Chicago')) = 7
      and extract(hour from (clock_timestamp() at time zone 'America/Chicago')) = 0;
  $cron$
);
