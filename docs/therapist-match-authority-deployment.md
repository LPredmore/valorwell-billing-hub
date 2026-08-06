# Therapist Match Authority Deployment

Production project: `ahqauomkgflopxgnlndd` (Billing Hub)

Deployed on August 6, 2026. The SQL stored in `supabase_migrations.schema_migrations.statements` is the authoritative record of what ran. Do not reconstruct these migrations from application code or deploy the retired Therapist CRM backend.

## Applied migration inventory

| Version | Name | Purpose |
|---|---|---|
| `20260806203440` | `therapist_match_authority_schema` | Match and event tables, relationship provenance, outbox claim/result boundary |
| `20260806203612` | `therapist_match_authority_request_and_activation` | Transactional match request and relationship activation |
| `20260806203727` | `therapist_match_authority_commands_and_context` | Accept, decline, cancel, first booking, client-safe authority context |
| `20260806203818` | `therapist_match_authority_workers_and_projection` | Expiration cron, outbox launcher, projection bypass |
| `20260806205541` | `client_portal_support_requests` | Auditable client support requests and CRM tasks |
| `20260806205616` | `fix_client_portal_support_due_interval` | Correct support-task due interval |
| `20260806210703` | `therapist_match_staff_review_contracts` | Role-scoped clinician queue and administrator reconciliation commands |
| `20260806211144` | `therapist_authority_action_contract_and_message_rls` | Action-contract authority overlay and confirmed-relationship message RLS |
| `20260806211404` | `legacy_relationship_containment_commands` | Idempotent preview/apply commands for the backfilled cohort |
| `20260806211506` | `tighten_legacy_current_care_evidence` | Require actual current clinical activity for automatic confirmation |

## Domain authority

- `client_therapist_matches` owns selection, reservation, clinician acceptance, expiration, and first-booking workflow.
- `client_staff_relationships` owns confirmed or historical care relationships.
- `clients.primary_staff_id` is a compatibility projection only.
- Direct therapist messaging requires an active `primary_therapist` relationship with `confirmation_state = 'confirmed'`.
- A pending self-scheduling match activates atomically with first appointment booking.
- A therapist-led match activates only after explicit clinician acceptance.
- Client support requests create internal CRM work; they do not create automatic portal messages.

## Runtime components

- `therapist-match-outbox-worker`: sends clinician operational notifications only.
- `book-client-appointment`: dispatches pending-first-appointment bookings to the atomic activation RPC.
- Cron `expire-therapist-matches`: every five minutes.
- Cron `therapist-match-outbox-worker`: every minute.

## Legacy cohort status

The containment command is deliberately separate from schema deployment.

Validated dry-run classification:

- 8 strong-current-care relationships
- 7 historical-care relationships requiring manual review
- 43 relationships with no care evidence

Do not invoke `admin_apply_legacy_relationship_containment` until both the client and staff application changes are deployed and verified.

## Exporting exact applied SQL

Run `scripts/export-therapist-match-authority-migrations.sql` through `psql` against Billing Hub. It returns the exact statement text stored for each production migration in version order.
