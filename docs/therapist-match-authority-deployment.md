# Therapist Match Authority Deployment

Production project: `ahqauomkgflopxgnlndd` (Billing Hub)

Deployed August 6–7, 2026. The SQL stored in `supabase_migrations.schema_migrations.statements` is the authoritative record of what ran. Do not reconstruct these migrations from application code or deploy the retired Therapist CRM backend.

## Applied migration inventory

| Version | Name | Purpose |
|---|---|---|
| `20260806203440` | `therapist_match_authority_schema` | Match and event tables, relationship provenance, outbox claim/result boundary |
| `20260806203612` | `therapist_match_authority_request_and_activation` | Transactional match request and relationship activation |
| `20260806203727` | `therapist_match_authority_commands_and_context` | Accept, decline, cancel, first booking, client-safe authority context |
| `20260806203818` | `therapist_match_authority_workers_and_projection` | Expiration cron, outbox launcher, projection controls |
| `20260806205541` | `client_portal_support_requests` | Auditable client support requests and CRM tasks |
| `20260806205616` | `fix_client_portal_support_due_interval` | Correct support-task due interval |
| `20260806210703` | `therapist_match_staff_review_contracts` | Role-scoped clinician queue and administrator reconciliation commands |
| `20260806211144` | `therapist_authority_action_contract_and_message_rls` | Action-contract authority overlay and confirmed-relationship message RLS |
| `20260806211404` | `legacy_relationship_containment_commands` | Idempotent preview/apply commands for the backfilled cohort |
| `20260806211506` | `tighten_legacy_current_care_evidence` | Require actual current clinical activity for automatic confirmation |
| `20260806212718` | `fix_legacy_containment_state_engine_context` | Align containment with canonical state-engine controls |
| `20260806213046` | `fix_legacy_review_state_engine_context` | Align manual legacy decisions with canonical state-engine controls |
| `20260806213818` | `fix_message_policy_admin_helper_execute` | Correct message-policy helper execution privileges |
| `20260807041049` | `normalize_legacy_review_client_lifecycle` | Add a locked administrative lifecycle normalization command |
| `20260807041216` | `apply_legacy_review_lifecycle_normalization_v4` | Normalize unresolved legacy reviews to readiness-derived intake/matching state |
| `20260807041848` | `create_legacy_relationship_reconciliation_tasks` | Create owned review tasks and complete them automatically after a decision |
| `20260807042927` | `retire_interactive_legacy_containment_commands` | Restrict completed one-time containment operations to service role only |
| `20260807043112` | `index_therapist_match_authority_foreign_keys` | Add targeted relationship and match-event FK indexes |

## Domain authority

- `client_therapist_matches` owns selection, capacity reservation, clinician acceptance, expiration, and first-booking workflow.
- `client_staff_relationships` owns confirmed or historical care relationships.
- `clients.primary_staff_id` is a compatibility projection only.
- Direct therapist messaging requires an active `primary_therapist` relationship with `confirmation_state = 'confirmed'`.
- A pending self-scheduling match activates atomically with first appointment booking.
- A therapist-led match activates only after explicit clinician acceptance.
- Client support requests create internal CRM work; they do not create automatic portal messages.

## Runtime components

- `therapist-match-outbox-worker`: clinician operational notifications only.
- `book-client-appointment`: dispatches pending-first-appointment bookings to the atomic activation RPC.
- Cron job 28 expires pending therapist matches every five minutes.
- Cron job 29 invokes the match outbox worker every minute.

## Legacy cohort cutover

The containment command was executed on August 6, 2026.

Initial classification:

- 8 relationships confirmed from strong current-care evidence
- 50 relationships placed into `legacy_review`

The 50 unresolved relationships were subsequently normalized so their client lifecycle reflects current readiness rather than the old therapist identifier:

- 50 clients are in `intake`
- 0 legacy-review clients remain in `matched`, `scheduled`, `early_care`, or `established_care`
- 0 legacy-review clients have direct therapist messaging authority
- each unresolved relationship has exactly one assigned high-priority CRM review task

No historical message, appointment, note, treatment-plan, or relationship record was deleted. The remaining 50 decisions require documented human review through the staff or CRM reconciliation workspace; they must not be bulk-confirmed or bulk-rejected.

## Security and performance boundary

- Match, match-event, support-request, and integration-outbox tables have no direct `anon` or general `authenticated` CRUD privileges.
- One-time containment and normalization commands are service-role only after cutover.
- Ongoing confirm/reject actions remain behind staff/admin authorization and optimistic concurrency.
- Targeted indexes cover relationship lookup by match and first appointment, plus event lookup by client and staff.
- Project-wide legacy Supabase advisor findings remain outside this release and must not be represented as resolved by this work.

## Production integrity checks

Validated after cutover:

- no client has multiple active confirmed primary relationships
- no client has multiple nonterminal therapist matches
- no `primary_staff_id` projection exists without a matching confirmed relationship
- no confirmed relationship disagrees with the client projection
- no legacy-review client has therapist messaging authority
- no legacy-review client remains in an active-care lifecycle stage
- no expired pending match remains nonterminal
- no match outbox row is stale or dead-lettered
- all 50 unresolved reviews have exactly one operational task

## Application release state

- Client Portal therapist-authority changes are merged to `valorwell-clients/main`.
- Staff therapist-match workspace is merged to `valorwell-staff/main`.
- CRM reconciliation workspace is merged to `valorwell-crm/main` and passed lint, TypeScript, tests, and production build checks.
- These Lovable-hosted applications require an external Share → Publish action; a GitHub merge alone does not prove the custom domains are serving the merged build.

## Exporting exact applied SQL

Run `scripts/export-therapist-match-authority-migrations.sql` through `psql` against Billing Hub. It returns the exact statement text stored for each production migration in version order.
