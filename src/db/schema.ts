import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  bigint,
  jsonb,
  primaryKey,
  unique,
  foreignKey,
  check,
  index,
} from 'drizzle-orm/pg-core'
import type { AdapterAccount } from '@auth/core/adapters'

export type MemberRole = 'owner' | 'admin' | 'editor' | 'reader'
export type AccountKind =
  | 'cash'
  | 'bank'
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense'
  | 'other'
export type JournalStatus = 'draft' | 'posted'
export type JournalSide = 'debit' | 'credit'
export type LedgerLineInput = {
  accountId: string
  side: JournalSide
  amountCents: number
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: timestamp('email_verified', {
      mode: 'date',
      withTimezone: true,
    }),
    image: text('image'),
  },
  (t) => [
    unique('user_email_unique').on(t.email),
    check('normalized_email', sql`${t.email} = lower(trim(${t.email}))`),
  ],
)

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    fiscalYearStartMonth: integer('fiscal_year_start_month')
      .notNull()
      .default(1),
    currency: text('currency').notNull().default('EUR'),
  },
  (t) => [
    check('organization_eur', sql`${t.currency} = 'EUR'`),
    check('fiscal_month', sql`${t.fiscalYearStartMonth} between 1 and 12`),
  ],
)

export const memberships = pgTable(
  'memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').$type<MemberRole>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    check('member_role', sql`${t.role} in ('owner','admin','editor','reader')`),
    index('members_by_user').on(t.userId),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<AccountKind>().notNull().default('other'),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(0),
  },
  (t) => [
    unique('account_org_code').on(t.organizationId, t.code),
    unique('account_org_id').on(t.organizationId, t.id),
    check(
      'account_kind',
      sql`${t.kind} in ('cash','bank','asset','liability','equity','income','expense','other')`,
    ),
  ],
)

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    date: date('date').notNull(),
    description: text('description').notNull(),
    status: text('status').$type<JournalStatus>().notNull().default('draft'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('entry_org_id').on(t.organizationId, t.id),
    unique('entry_org_operation').on(t.organizationId, t.idempotencyKey),
    check('entry_status', sql`${t.status} in ('draft','posted')`),
    index('entry_org_date').on(t.organizationId, t.date),
  ],
)

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    accountId: uuid('account_id').notNull(),
    side: text('side').$type<JournalSide>().notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entryId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.accountId],
      foreignColumns: [accounts.organizationId, accounts.id],
    }),
    check(
      'positive_safe_cents',
      sql`${t.amountCents} between 1 and 9007199254740991`,
    ),
    check('line_side', sql`${t.side} in ('debit','credit')`),
    index('lines_by_entry').on(t.entryId),
  ],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    entryId: uuid('entry_id'),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entryId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
    }),
  ],
)

export type MovementType = 'income' | 'expense' | 'transfer'
export const movements = pgTable(
  'movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    journalEntryId: uuid('journal_entry_id').notNull(),
    type: text('type').$type<MovementType>().notNull(),
    date: date('date').notNull(),
    description: text('description').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    financialAccountId: uuid('financial_account_id').notNull(),
    counterAccountId: uuid('counter_account_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('movement_operation').on(t.organizationId, t.idempotencyKey),
    unique('movement_entry').on(t.journalEntryId),
    foreignKey({
      columns: [t.organizationId, t.journalEntryId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.financialAccountId],
      foreignColumns: [accounts.organizationId, accounts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.counterAccountId],
      foreignColumns: [accounts.organizationId, accounts.id],
    }),
    check('movement_type', sql`${t.type} in ('income','expense','transfer')`),
    check(
      'movement_cents',
      sql`${t.amountCents} between 1 and 9007199254740991`,
    ),
    check(
      'movement_distinct_accounts',
      sql`${t.financialAccountId} <> ${t.counterAccountId}`,
    ),
  ],
)

export const authAccounts = pgTable(
  'auth_accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
})
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

export const loginRateLimits = pgTable(
  'login_rate_limits',
  {
    keyHash: text('key_hash').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    attempts: integer('attempts').notNull().default(1),
  },
  (t) => [index('login_limits_window').on(t.windowStart)],
)

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    year: integer('year').notNull(),
    annualCents: bigint('annual_cents', { mode: 'number' })
      .notNull()
      .default(0),
    version: integer('version').notNull().default(0),
  },
  (t) => [
    unique('budget_org_year').on(t.organizationId, t.year),
    unique('budget_org_id').on(t.organizationId, t.id),
    check('budget_year', sql`${t.year} between 1900 and 9998`),
    check(
      'budget_annual_cents',
      sql`${t.annualCents} between 0 and 9007199254740991`,
    ),
    check('budget_version', sql`${t.version} >= 0`),
  ],
)
export const budgetCells = pgTable(
  'budget_cells',
  {
    organizationId: uuid('organization_id').notNull(),
    budgetId: uuid('budget_id').notNull(),
    month: integer('month').notNull(),
    accountId: uuid('account_id').notNull(),
    plannedCents: bigint('planned_cents', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.budgetId, t.month, t.accountId] }),
    foreignKey({
      columns: [t.organizationId, t.budgetId],
      foreignColumns: [budgets.organizationId, budgets.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.accountId],
      foreignColumns: [accounts.organizationId, accounts.id],
    }),
    check('budget_month', sql`${t.month} between 1 and 12`),
    check(
      'budget_cell_cents',
      sql`${t.plannedCents} between 0 and 9007199254740991`,
    ),
  ],
)
export const budgetEvents = pgTable(
  'budget_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    budgetId: uuid('budget_id').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').$type<'revise' | 'transfer'>().notNull(),
    version: integer('version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    reason: text('reason'),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.budgetId],
      foreignColumns: [budgets.organizationId, budgets.id],
    }),
    unique('budget_event_operation').on(t.budgetId, t.idempotencyKey),
    unique('budget_event_version').on(t.budgetId, t.version),
    check('budget_event_action', sql`${t.action} in ('revise','transfer')`),
  ],
)
