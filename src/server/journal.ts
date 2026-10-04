import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, inArray, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  accounts,
  journalEntries,
  journalLines,
  auditEvents,
  memberships,
  type LedgerLineInput,
} from '../db/schema'
import {
  requireMember,
  ForbiddenError,
  InvalidInputError,
  ConflictError,
  uuidPattern,
} from './authorization'

export type JournalInput = {
  organizationId: string
  actorId: string
  date: string
  description: string
  idempotencyKey: string
  lines: LedgerLineInput[]
}
export type JournalEntryView = {
  id: string
  date: string
  description: string
  status: string
  actorId: string
  lines: LedgerLineInput[]
  events: { action: string }[]
}

export async function postJournal(
  input: JournalInput,
): Promise<{ id: string }> {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
  ])
  return getDb().transaction((tx) => postJournalInTransaction(tx, input))
}

export type JournalTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>['transaction']>[0]
>[0]
export async function postJournalInTransaction(
  tx: JournalTransaction,
  input: JournalInput,
): Promise<{ id: string }> {
  return writeJournal(tx, input, false)
}
export async function reverseJournalInTransaction(
  tx: JournalTransaction,
  input: { organizationId: string; actorId: string; entryId: string },
) {
  const [original] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.organizationId, input.organizationId),
        eq(journalEntries.id, input.entryId),
        eq(journalEntries.status, 'posted'),
      ),
    )
  if (!original) throw new ForbiddenError()
  const lines = await tx
    .select()
    .from(journalLines)
    .where(
      and(
        eq(journalLines.organizationId, input.organizationId),
        eq(journalLines.entryId, input.entryId),
      ),
    )
  return writeJournal(
    tx,
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      date: original.date,
      description: `Estorno: ${original.description}`.slice(0, 500),
      idempotencyKey: `reversal_${original.id}`,
      lines: lines.map((line) => ({
        accountId: line.accountId,
        side: line.side === 'debit' ? 'credit' : 'debit',
        amountCents: line.amountCents,
      })),
    },
    true,
  )
}
async function writeJournal(
  tx: JournalTransaction,
  input: JournalInput,
  allowInactive: boolean,
): Promise<{ id: string }> {
  const calendarDate = new Date(`${input.date}T00:00:00.000Z`)
  if (
    typeof input.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== input.date ||
    typeof input.description !== 'string' ||
    !input.description.trim() ||
    input.description.length > 500 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey)
  )
    throw new InvalidInputError()
  if (
    !Array.isArray(input.lines) ||
    input.lines.length < 2 ||
    input.lines.length > 200 ||
    input.lines.some(
      (line) =>
        !line ||
        !uuidPattern.test(line.accountId) ||
        !['debit', 'credit'].includes(line.side) ||
        !Number.isSafeInteger(line.amountCents) ||
        line.amountCents <= 0,
    )
  )
    throw new InvalidInputError()
  let debits = BigInt(0),
    credits = BigInt(0)
  for (const line of input.lines) {
    if (line.side === 'debit') debits += BigInt(line.amountCents)
    else credits += BigInt(line.amountCents)
  }
  if (debits !== credits || debits > BigInt(Number.MAX_SAFE_INTEGER))
    throw new InvalidInputError()
  const [member] = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, input.actorId),
        eq(memberships.organizationId, input.organizationId),
      ),
    )
    .for('share')
  if (!member || !['owner', 'admin', 'editor'].includes(member.role))
    throw new ForbiddenError()
  const selected = await tx
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.organizationId, input.organizationId),
        inArray(
          accounts.id,
          input.lines.map((line) => line.accountId),
        ),
        allowInactive ? undefined : eq(accounts.active, true),
      ),
    )
    .for('share')
  if (
    new Set(input.lines.map((line) => line.accountId)).size !== selected.length
  )
    throw new ForbiddenError()
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        actorId: input.actorId,
        date: input.date,
        description: input.description,
        lines: input.lines.map((line) => ({
          accountId: line.accountId,
          side: line.side,
          amountCents: line.amountCents,
        })),
      }),
    )
    .digest('hex')
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      organizationId: input.organizationId,
      actorId: input.actorId,
      date: input.date,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    })
    .onConflictDoNothing({
      target: [journalEntries.organizationId, journalEntries.idempotencyKey],
    })
    .returning({ id: journalEntries.id })
  if (!entry) {
    const [existing] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.organizationId, input.organizationId),
          eq(journalEntries.idempotencyKey, input.idempotencyKey),
        ),
      )
    if (
      !existing ||
      existing.status !== 'posted' ||
      existing.requestHash !== requestHash
    )
      throw new ConflictError()
    return { id: existing.id }
  }
  await tx.insert(journalLines).values(
    input.lines.map((line) => ({
      ...line,
      organizationId: input.organizationId,
      entryId: entry.id,
    })),
  )
  await tx.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    entryId: entry.id,
    action: 'journal.posted',
    data: {
      date: input.date,
      description: input.description,
      lines: input.lines,
    },
  })
  await tx
    .update(journalEntries)
    .set({ status: 'posted' })
    .where(eq(journalEntries.id, entry.id))
  return entry
}
export async function listJournal(
  organizationId: string,
  actorId: string,
): Promise<JournalEntryView[]> {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  const entries = await getDb()
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.organizationId, organizationId),
        eq(journalEntries.status, 'posted'),
      ),
    )
    .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
  if (!entries.length) return []
  const ids = entries.map((entry) => entry.id)
  const lines = await getDb()
    .select()
    .from(journalLines)
    .where(
      and(
        eq(journalLines.organizationId, organizationId),
        inArray(journalLines.entryId, ids),
      ),
    )
  const events = await getDb()
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        inArray(auditEvents.entryId, ids),
      ),
    )
  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    description: entry.description,
    status: entry.status,
    actorId: entry.actorId,
    lines: lines
      .filter((line) => line.entryId === entry.id)
      .map((line) => ({
        accountId: line.accountId,
        side: line.side,
        amountCents: line.amountCents,
      })),
    events: events
      .filter((event) => event.entryId === entry.id)
      .map((event) => ({ action: event.action })),
  }))
}
