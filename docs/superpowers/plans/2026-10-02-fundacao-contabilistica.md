# Fundação contabilística — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma fundação utilizável e testável: autenticação por email, organizações isoladas, plano de contas e diário de partidas dobradas em PostgreSQL, com interface mínima para lançar e consultar.

**Architecture:** A interface Next.js existente continua como demonstração até a rota autenticada estar completa. Serviços no servidor fazem autorização por organização e escritas atómicas no diário; PostgreSQL é a fonte de verdade. Esta é a primeira de quatro entregas: depois vêm (2) movimentos simples/chat e correções, (3) orçamentos/relatórios e (4) conciliação/operação. Cada uma terá plano próprio antes da execução.

**Tech Stack:** Next.js 16.3.6, React 19.3.0, TypeScript 5.9.3, PostgreSQL, Drizzle ORM/Kit, `postgres` (driver), Auth.js com adaptador Drizzle e login por magic link SMTP, Vitest 5.0.1.

**Spec:** `docs/superpowers/specs/2026-10-02-contabilidade-financeira-gestao-design.md`

## Global Constraints

- Dados reais de várias organizações, sempre separados e autorizados no servidor.
- EUR; montantes persistidos em cêntimos inteiros, sem `float` em cálculos.
- Lançamentos confirmados imutáveis e equilibrados; correções futuras por estorno/substituição.
- O protótipo `localStorage` e os dados demo não são migrados nem misturados automaticamente.
- Não publicar a rota real como produção antes de SMTP, base de dados, backups/restauro e testes de segurança estarem verificados.
- Antes de alterar código Next.js, ler as guias locais relevantes em `node_modules/next/dist/docs/` (regra de `AGENTS.md`).
- Migrações são aplicadas por comando explícito, nunca durante `next build` ou automaticamente a cada pedido.

## Review Focus

1. `organizationId` de outra organização enviado à API: deve devolver acesso negado sem revelar nomes, saldos ou existência de contas (Task 2, Task 3).
2. `amountCents` fracionário, `NaN`, zero ou negativo: deve ser rejeitado antes da escrita (Task 3).
3. Débito e crédito diferentes por um cêntimo: confirmação deve falhar sem linhas parciais (Task 3).
4. Submissão repetida por clique duplo ou repetição da rede: deve criar um único lançamento por chave de idempotência (Task 3).
5. Ausência de SMTP, `AUTH_SECRET` ou `DATABASE_URL`: não deve abrir acesso anónimo nem apresentar sucesso fictício (Task 2, Task 4).

## Mapa de ficheiros

- `src/db/schema.ts`: tabelas Drizzle e restrições; `src/db/client.ts`: conexão server-only; `drizzle.config.ts`, `drizzle/`: migrações.
- `src/auth.ts` e `src/app/api/auth/[...nextauth]/route.ts`: Auth.js; `src/server/authorization.ts`: sessão e papel organizacional.
- `src/server/organizations.ts`: criação e listagem de organizações, memberships e contas iniciais; `src/server/journal.ts`: validação e escrita atómica; `src/app/api/organizations/route.ts` e `src/app/api/organizations/[organizationId]/journal/route.ts`: superfície HTTP autenticada.
- `src/app/contabilidade/page.tsx` e `src/components/accounting-workspace.tsx`: interface autenticada mínima, isolada do shell demo.
- `tests/accounting-schema.test.ts`, `tests/helpers/database.ts`, `tests/authorization.test.ts`, `tests/journal.test.ts`, `tests/accounting-workspace.test.tsx`: regressões. `README.md` e `.env.example`: configuração e aviso de demo.

### Task 1: Base PostgreSQL e esquema contabilístico

**Files:** Create `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `tests/accounting-schema.test.ts`; modify `package.json`, `package-lock.json`, `.env.example`, `README.md`; generate `drizzle/`.

**Interfaces:** Produces `db`, `organizations`, `memberships`, `accounts`, `journalEntries`, `journalLines`, `auditEvents`; IDs UUID string; quantias `amountCents: number` na aplicação e `bigint` no PostgreSQL.

- [ ] **Step 1: Write failing schema test.** `tests/accounting-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { accounts, journalEntries, journalLines, memberships } from '../src/db/schema';

describe('accounting schema', () => {
  it('exports organization-scoped tables', () => {
    expect(accounts).toBeDefined();
    expect(memberships).toBeDefined();
    expect(journalEntries).toBeDefined();
    expect(journalLines).toBeDefined();
  });
});
```

- [ ] **Step 2: Run `npm test -- tests/accounting-schema.test.ts`; expect FAIL because `src/db/schema.ts` does not exist.**
- [ ] **Step 3: Install `drizzle-orm`, `postgres`; dev dependency `drizzle-kit`. Add the tables with UUID keys, `organizationId` on all domain rows, membership unique `(organizationId,userId)`, account unique `(organizationId,code)`, journal entry unique `(organizationId,idempotencyKey)`, line check `amount_cents > 0`, side `debit|credit`, and composite foreign keys to prevent cross-organization references. Do not put ledger totals in an editable balance column. Use the following shape for the core tables:**

```ts
export type MemberRole = 'owner' | 'admin' | 'editor' | 'reader';
export type JournalStatus = 'draft' | 'posted';
export type JournalSide = 'debit' | 'credit';
export type LedgerLineInput = { accountId: string; side: JournalSide; amountCents: number };
```

- [ ] **Step 4: Configure `src/db/client.ts` to read `DATABASE_URL` only on the server, use `postgres` + `drizzle`, and fail closed on missing URL. Configure `drizzle.config.ts`, generate migration with `npx drizzle-kit generate`; review generated SQL for constraints and indexes. Create `tests/helpers/database.ts` that requires `DATABASE_URL_TEST`, applies the generated migration to that database only and truncates test tables between tests. Never point this helper at `DATABASE_URL`. Run `npm test -- tests/accounting-schema.test.ts`, `npm run typecheck`, `npm run lint`; expect PASS.**
- [ ] **Step 5: Document `DATABASE_URL`, `DATABASE_URL_TEST`, migration commands and demo/real separation. Commit only these files with `git commit -m "feat: add accounting database schema"`.**

### Task 2: Login e autorização por organização

**Files:** Create `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/server/authorization.ts`, `src/server/organizations.ts`, `src/app/api/organizations/route.ts`, `tests/authorization.test.ts`; extend `src/db/schema.ts`, migration, `.env.example`, `README.md`, `package.json`, `package-lock.json`.

**Interfaces:** `requireMember(userId: string, organizationId: string, allowed: readonly MemberRole[]): Promise<MemberRole>` throws `UnauthorizedError`/`ForbiddenError`; `createOrganization(ownerId: string, name: string): Promise<{id:string;name:string}>`; `listOrganizations(userId: string): Promise<Array<{id:string;name:string;role:MemberRole}>>`.

- [ ] **Step 1: Write failing authorization tests with an isolated PostgreSQL test database. Create users A/B and organizations X/Y, then assert `requireMember(A,X,['owner'])` resolves `owner`, `requireMember(A,Y,['reader'])` rejects, and reader cannot call with `['editor']`. Add a test that a forged organization ID returns the same public 403 response as an unknown ID.**
- [ ] **Step 2: Run `npm test -- tests/authorization.test.ts`; expect FAIL because `requireMember` is missing.**
- [ ] **Step 3: Install `next-auth`, `@auth/drizzle-adapter` and `nodemailer` (plus its TypeScript declarations). Add Auth.js Drizzle adapter tables (`users`, `authAccounts`, `sessions`, `verificationTokens`) using separate names from the accounting `accounts` table, and configure magic-link login with SMTP. Keep `AUTH_SECRET`, `EMAIL_SERVER`, `EMAIL_FROM` and `DATABASE_URL` server-only. Use database sessions, email addresses unique after normalization, and no auto-membership on sign-in. The auth route exports `GET`/`POST` from Auth.js handlers.**

```ts
import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db/client';
import { users, authAccounts, sessions, verificationTokens } from './db/schema';

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: [Nodemailer({ server: process.env.EMAIL_SERVER, from: process.env.EMAIL_FROM })],
});
```

- [ ] **Step 4: Implement `requireMember` with a database query filtering both `userId` and `organizationId`, checking role server-side. Let an authenticated user create an organization and become its owner in one transaction; list only memberships belonging to current user. Route handlers obtain identity through `auth()` and never trust user IDs from the request body. Add tests for no session, unknown org, and missing SMTP/secret; run focused tests and expect PASS.**
- [ ] **Step 5: Update env/readme, run `npm run typecheck`, `npm run lint`, `npm run build`; commit with `git commit -m "feat: authenticate organization members"`.**

### Task 3: Diário contabilístico imutável

**Files:** Create `src/server/journal.ts`, `src/app/api/organizations/[organizationId]/journal/route.ts`, `tests/journal.test.ts`; extend `src/db/schema.ts` and migration if test-discovered constraints demand it.

**Interfaces:** `postJournal(input: {organizationId:string;actorId:string;date:string;description:string;idempotencyKey:string;lines:LedgerLineInput[]}): Promise<{id:string}>`; `listJournal(organizationId:string, actorId:string): Promise<JournalEntryView[]>`. The route derives `actorId` from the session and treats route `organizationId` as untrusted.

- [ ] **Step 1: Write failing integration tests for a 18000-cent debit/credit pair, 17999-cent credit mismatch, fractional/zero/negative amounts, wrong-org account ID, reader role, and identical `idempotencyKey` submitted twice. Assert the successful pair creates exactly one posted entry/two lines/one audit event and all failures leave row counts unchanged.**
- [ ] **Step 2: Run `npm test -- tests/journal.test.ts`; expect FAIL because `postJournal` is missing.**
- [ ] **Step 3: Implement validation and one-transaction posting. Use these checks before insert, then verify each account belongs to the organization inside the same database transaction; insert entry, lines and audit event atomically. On a repeated `(organizationId,idempotencyKey)`, return the existing entry only if the request payload matches its stored request hash; otherwise return conflict.**

```ts
function assertBalanced(lines: LedgerLineInput[]): void {
  if (lines.length < 2 || lines.some((line) => !Number.isSafeInteger(line.amountCents) || line.amountCents <= 0))
    throw new Error('Invalid journal lines');
  const debits = lines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + line.amountCents, 0);
  const credits = lines.filter((line) => line.side === 'credit').reduce((sum, line) => sum + line.amountCents, 0);
  if (!Number.isSafeInteger(debits) || debits !== credits) throw new Error('Unbalanced journal');
}
```

- [ ] **Step 4: Add authorized GET/POST route. Validate date as an actual calendar date, description length and body size. Map invalid input to 400, unauthenticated to 401, forbidden/unknown organization to identical 403, idempotency conflict to 409 and storage failure to 503; do not echo secrets or raw SQL errors. Run focused tests and `npm run typecheck`, `npm run lint`; expect PASS.**
- [ ] **Step 5: Commit with `git commit -m "feat: post balanced journals atomically"`.**

### Task 4: Interface mínima autenticada e verificação de ponta a ponta

**Files:** Create `src/app/contabilidade/page.tsx`, `src/components/accounting-workspace.tsx`, `tests/accounting-workspace.test.tsx`; modify `src/app/page.tsx` or add a navigation link without replacing the demo; update `README.md`, `package.json`, `package-lock.json`, `vitest.config.ts`.

**Interfaces:** The page reads `auth()` server-side, redirects anonymous visitors to sign-in, lists only the user's organizations, and renders `AccountingWorkspace` for organization/account selection, debit/credit rows, amount, date, description and journal history.

- [ ] **Step 1: Install `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` and `jsdom` as dev dependencies and configure Vitest's `jsdom` environment for this test. Add a failing UI test: anonymous visitor cannot load `/contabilidade`; authenticated reader sees journal but no submit control; editor posts a balanced 180 € entry and sees it once after refresh; a simulated 503 shows an error and retains form values. Test the server redirect separately from the client component.**
- [ ] **Step 2: Run `npm test -- tests/accounting-workspace.test.tsx`; expect FAIL because page/component do not exist.**
- [ ] **Step 3: Build the protected page and form. Keep `/` as demo with an explicit demo badge. Submit a stable idempotency key per form attempt; disable submit while pending; only clear the form after a successful server response. Show Portuguese validation/access/storage messages without claiming the write happened on failure.**

```tsx
const response = await fetch(`/api/organizations/${organizationId}/journal`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ date, description, idempotencyKey, lines }),
});
if (!response.ok) throw new Error('Não foi possível guardar o lançamento. Tenta novamente.');
```

- [ ] **Step 4: Run focused test, full `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Manually exercise sign-in (local SMTP catcher), organization creation, posting, refresh, reader restrictions and missing database. Confirm no path from demo creates real journal entries.**
- [ ] **Step 5: Record evidence and known operational prerequisites in `README.md`. Commit with `git commit -m "feat: add protected accounting workspace"`. Request independent security/data-integrity review before starting the next plan.**

## Execution boundary

This plan delivers the first independently testable slice, not all features in the spec. Continue with separate plans for simple transactions/chat and reversals, budgets/reports, then reconciliation/backups/deployment. Never switch the public Vercel app from demo to real-data mode until the full spec's operational acceptance criteria are met.
