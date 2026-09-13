do $block$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid
    from cron.job
    where jobname in (
      'refresh-homepage-documented-impact-weekly',
      'refresh-homepage-documented-impact-monthly'
    )
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end;
$block$;

select cron.schedule(
  'refresh-homepage-documented-impact-monthly',
  '0 5,6 1 * *',
  $cron$
    select private.refresh_homepage_documented_monthly_impact_snapshot()
    where extract(day from (clock_timestamp() at time zone 'America/Chicago')) = 1
      and extract(hour from (clock_timestamp() at time zone 'America/Chicago')) = 0;
  $cron$
);
