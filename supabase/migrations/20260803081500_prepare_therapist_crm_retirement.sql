alter table public.givebutter_donations
  add column if not exists ads_exported_at timestamptz;

create table if not exists public.legacy_therapist_crm_archive (
  source_table text not null,
  source_key text not null,
  payload jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (source_table, source_key)
);

comment on table public.legacy_therapist_crm_archive is
  'Read-only retirement archive of non-canonical business records from Supabase project asjhkidpuhqodryczuth. Password and secret fields are excluded during import.';

alter table public.legacy_therapist_crm_archive enable row level security;
revoke all on table public.legacy_therapist_crm_archive from anon, authenticated;
grant select, insert, update, delete on table public.legacy_therapist_crm_archive to service_role;
