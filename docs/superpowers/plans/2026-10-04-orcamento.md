# Orçamento — implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; no subdelegation. Parent confirmed interfaces and execution against the approved spec.

**Goal:** Annual and monthly/category planning, manual revisions/transfers and ledger-derived actuals.

**Architecture:** Three organization-scoped PostgreSQL tables: budget, cells, events. Owner/admin writes are versioned and idempotent in one transaction; every member reads. Actuals come from posted expense journal lines, not movement copies.

**Tech Stack:** Existing Next.js, Drizzle, PostgreSQL, Vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-contabilidade-financeira-gestao-design.md`

## Global constraints

- EUR integer cents; overspending and over-allocation warn, never block.
- Categories are explicit expense accounts. Fiscal year is named by its starting year; cell month is calendar month1..12.
- Missing budget reads as version0/annual0, without creating data. Revision creates it explicitly.
- RLS enabled and browser roles/PUBLIC privileges revoked; server membership checks remain mandatory.
- Separate disposable local `personal_cfo_budget_test`; never production or the auditor's movement database.
- No UI changes in this cut, per parent coordination.

## Review focus

1. Foreign/inactive category IDs: reject writes without revealing data.
2. Transfer beyond source allocation: reject and preserve both cells/history.
3. Concurrent stale version and repeated keys: conflict or one matching receipt, no lost revision.
4. Posted credits/reversals, inactive historical categories and non-January exercise: actuals stay exact and correctly scoped.
5. Large aggregated cents: return decimal integer strings, never lose precision.

### Task 1: Revision and read service

**Files:** `src/db/schema.ts`, `src/server/budgets.ts`, `drizzle/`, `tests/budgets.test.ts`.

**Interfaces:** `getBudget(organizationId,actorId,year)`; `reviseBudget({organizationId,actorId,year,expectedVersion,idempotencyKey,annualCents?,cells?:{month,accountId,plannedCents}[],reason?}) -> {version}`.

- [ ] Write a tracer at the public service seam and run RED:

```ts
await reviseBudget({
  ...identity,
  year: 2026,
  expectedVersion: 0,
  idempotencyKey: 'initial',
  annualCents: 7000000,
  cells: [{ month: 10, accountId: expenseId, plannedCents: 10000 }],
})
expect(await getBudget(orgId, userId, 2026)).toMatchObject({
  annualCents: 7000000,
  plannedCents: '10000',
  undistributedCents: '6990000',
  version: 1,
})
```

- [ ] Add tables, migration, scoped authorization/validation and atomic versioned revision/history. Run focused test GREEN.
- [ ] Add one RED tracer for 18000-cent posted expense against10000 planned: realized18000,available-8000,deficit warning. Implement SQL ledger aggregation and run GREEN.
- [ ] Add RED→GREEN cases for annual reduction/sobrealocação, non-January exercise, exact large totals and inactive historical categories.
- [ ] Commit revision/read service after full suite passes.

### Task 2: Transfer and API/security

**Files:** `src/server/budgets.ts`, `src/app/api/organizations/[organizationId]/budgets/[year]/route.ts`, `tests/budgets.test.ts`, security migration.

**Interfaces:** `transferBudget({...identity,year,expectedVersion,idempotencyKey,from:{month,accountId},to:{month,accountId},amountCents,reason?}) -> {version}`. GET reads; POST action=`revise|transfer` derives actor/org/year server-side.

- [ ] RED transfer3000 from10000 toanothermonth; GREEN leaves7000/3000, same total and before/after history.
- [ ] RED public HTTP route; GREEN anonymous401, forgedorg403, reader/editor write403 and safe invalid400.
- [ ] Verify stale/concurrent versions409, repeated key exactlyonce, changed key payload409, invalid/fractional/negative cents400, transfer insufficient400 and forced event failure rolls back all state.
- [ ] Generate custom security migration: enable RLS and REVOKE ALL from PUBLIC and existing anon/authenticated/service_role on budgets/cells/events and movements.
- [ ] Run full PostgreSQL suite, lint, typecheck, format, build; commit and return to parent for independent review. UI/deploy remain untouched.

## Execution decisions

- Parent approved interfaces and explicitly instructed no repeat approval pause.
- Integer totals/actuals/available/undistributed are decimal strings; input/cell planned and annual values stay safe integer numbers. Cost if wrong: UI consumers must handle integer strings.
- Independent review is performed by parent; no reviewer subagent is created.

## Delivered cut

- Implemented both public services and authenticated GET/POST API without UI changes.
- RED→GREEN tracers: revision/history, journal actuals/reversal, transfer/history, route/session authorization, RLS browser-role isolation. Added regression coverage for cents/month/category validation, overallocation, replay, concurrent versions and insufficient-transfer atomicity.
- Budget RLS and revokes are applied immediately after each CREATE TABLE in 0009; 0010 only hardens movements inherited from base 17d45cc. Integration must reconcile migration numbering with the parent branch.
- Fresh disposable PostgreSQL migration and final suite: 100 passed, 2 gated HTTP/SMTP smoke tests skipped. Lint, typecheck, formatting and production build passed. One initial parallel run had a worker-start timeout; serial rerun passed cleanly.
- Remaining verification: forced database-write failure injection, non-January fiscal boundary, inactive historical category and totals above the JavaScript safe-integer boundary are not yet dedicated regression tests. No deployment or production readiness claim; independent review remains required.
