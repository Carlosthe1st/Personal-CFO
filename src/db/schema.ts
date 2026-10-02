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
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    unique('account_org_code').on(t.organizationId, t.code),
    unique('account_org_id').on(t.organizationId, t.id),
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
