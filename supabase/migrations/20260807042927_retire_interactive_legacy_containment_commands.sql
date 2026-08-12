revoke all on function public.admin_apply_legacy_relationship_containment(text) from public,anon,authenticated;
revoke all on function public.admin_preview_legacy_relationship_containment() from public,anon,authenticated;
grant execute on function public.admin_apply_legacy_relationship_containment(text) to service_role;
grant execute on function public.admin_preview_legacy_relationship_containment() to service_role;

comment on function public.admin_apply_legacy_relationship_containment(text) is
  'Retired one-time legacy therapist containment command. Service-role only after completed production cutover on 2026-08-06.';
comment on function public.admin_preview_legacy_relationship_containment() is
  'Retired one-time legacy therapist containment preview. Service-role only after completed production cutover on 2026-08-06.';
