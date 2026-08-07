\pset tuples_only on
\pset format unaligned
\pset fieldsep ''

select format(
  E'-- BEGIN MIGRATION %s_%s.sql\n%s\n-- END MIGRATION %s_%s.sql\n',
  version,
  name,
  statements[1],
  version,
  name
)
from supabase_migrations.schema_migrations
where version in (
  '20260806203440',
  '20260806203612',
  '20260806203727',
  '20260806203818',
  '20260806205541',
  '20260806205616',
  '20260806210703',
  '20260806211144',
  '20260806211404',
  '20260806211506',
  '20260806212718',
  '20260806213046',
  '20260806213818',
  '20260807041049',
  '20260807041216',
  '20260807041848'
)
order by version;
