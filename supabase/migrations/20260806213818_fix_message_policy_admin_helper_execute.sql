grant execute on function private.therapist_match_admin_authorized() to authenticated;

comment on function private.therapist_match_admin_authorized() is
  'Security-definer boolean authorization helper used by staff workflow RPCs and message RLS. Callable by authenticated users but returns only authorization state derived from server-owned staff role assignments.';
