# Movement corrections and confirmed chat proposals

Spec: `docs/superpowers/specs/2026-10-02-contabilidade-financeira-gestao-design.md`.
Approved scope: isolated clone, no deployment, no account/category or report changes.

## Task 1: Atomic correction/removal service and API

Interfaces: `changeMovement({organizationId,actorId,movementId,idempotencyKey,reason,replacement?})`; replacement is a complete movement excluding actor/key. `listMovements` includes status and correction history. POST `/api/organizations/[organizationId]/movements/[movementId]/changes` derives actor and source organization from session/URL.

- RED→GREEN: remove a 180 EUR expense, preserving original and reversing all original lines exactly once.
- RED→GREEN: replace180 with150, change date/category/accounts/organization with permissions in both organizations; immutable linked history.
- RED→GREEN: readers/foreign organizations, inactive replacement accounts, invalid cents, key mismatch, concurrent corrections, failed replacement/history rollback.
- Migration: scoped foreign keys, unique original/operation, RLS and REVOKE within creation migration (after parent0011).
- Verify PostgreSQL suite; commit service/API.

## Task 2: Correction/removal UI

Interfaces: existing accounting workspace, movement listing and confirmation forms; edits only become writes after explicit confirmation.

- RED→GREEN: correction preview/edit, removal confirmation/cancel, failure retains input/key and no false success; readers cannot edit.
- Reuse existing movement form; support authorized destination organization and its accounts, hide stale responses.
- Verify full suite/lint/type/format/build; commit.

## Task 3: Chat proposals

Interfaces: existing local deterministic interpreter, accounting chat form and reviewed movement form; no persistence until explicit confirmation via same movements API.

- RED→GREEN: proposal creates no write until reviewed/confirmed; ambiguous/invalid requests require adjustment, failed retry remains idempotent.
- Verify full suite/lint/type/format/build; commit and independent parent review.

## Rulings

- No repeat design approval: parent confirms existing spec authorization and these service/API/UI seams.
- Reversal uses original accounting date, cancelling its original period; replacement uses corrected date. Cost if wrong: accounting-period policy would need adjustment.
- Corrections preserve originals, with one correction per movement; further edits target the replacement. Cost if wrong: API clients must follow replacement IDs.
