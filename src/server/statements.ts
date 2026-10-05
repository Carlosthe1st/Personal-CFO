import 'server-only'
import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  accounts,
  auditEvents,
  journalEntries,
  journalLines,
  memberships,
  statementImports,
  statementLines,
} from '../db/schema'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  requireMember,
  uuidPattern,
} from './authorization'
import type { StatementRow } from '../lib/statement-csv'

type Identity = { organizationId: string; actorId: string; accountId: string }
type RowsInput = Identity & { rows: StatementRow[] }
function validRow(row: StatementRow) {
  const parsed = new Date(`${row?.date}T00:00:00Z`)
  return (
    !!row &&
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === row.date &&
    typeof row.description === 'string' &&
    !!row.description.trim() &&
    row.description.length <= 500 &&
    Number.isSafeInteger(row.amountCents) &&
    row.amountCents !== 0
  )
}
function validateRows(input: RowsInput) {
  if (
    !uuidPattern.test(input.accountId) ||
    !Array.isArray(input.rows) ||
    input.rows.length < 1 ||
    input.rows.length > 500 ||
    input.rows.some((row) => !validRow(row))
  )
    throw new InvalidInputError()
}
function fingerprint(row: StatementRow) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.date,
        row.description.trim().toLowerCase(),
        row.amountCents,
      ]),
    )
    .digest('hex')
}
async function accountAccess(input: Identity, write: boolean) {
  await requireMember(
    input.actorId,
    input.organizationId,
    write ? ['owner', 'admin'] : ['owner', 'admin', 'editor', 'reader'],
  )
  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.organizationId, input.organizationId),
        eq(accounts.id, input.accountId),
      ),
    )
  if (!account || !['cash', 'bank'].includes(account.kind))
    throw new ForbiddenError()
}
export async function previewStatement(input: RowsInput) {
  validateRows(input)
  await accountAccess(input, true)
  const fingerprints = input.rows.map(fingerprint)
  const existing = await getDb()
    .select({ fingerprint: statementLines.fingerprint })
    .from(statementLines)
    .where(
      and(
        eq(statementLines.organizationId, input.organizationId),
        eq(statementLines.accountId, input.accountId),
        inArray(statementLines.fingerprint, fingerprints),
      ),
    )
  const seen = new Set(existing.map((line) => line.fingerprint))
  return input.rows.map((row) => {
    const key = fingerprint(row),
      duplicate = seen.has(key)
    seen.add(key)
    return { ...row, duplicate }
  })
}
export async function importStatement(
  input: RowsInput & { idempotencyKey: string; includeDuplicates: boolean },
) {
  validateRows(input)
  if (
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey) ||
    typeof input.includeDuplicates !== 'boolean'
  )
    throw new InvalidInputError()
  await accountAccess(input, true)
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        accountId: input.accountId,
        rows: input.rows,
        includeDuplicates: input.includeDuplicates,
      }),
    )
    .digest('hex')
  return getDb().transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.userId, input.actorId),
        ),
      )
      .for('share')
    if (!member || !['owner', 'admin'].includes(member.role))
      throw new ForbiddenError()
    const [account] = await tx
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.organizationId, input.organizationId),
          eq(accounts.id, input.accountId),
        ),
      )
      .for('update')
    if (!account || !['bank', 'cash'].includes(account.kind) || !account.active)
      throw new ForbiddenError()
    const [replay] = await tx
      .select()
      .from(statementImports)
      .where(
        and(
          eq(statementImports.organizationId, input.organizationId),
          eq(statementImports.idempotencyKey, input.idempotencyKey),
        ),
      )
    if (replay) {
      if (replay.requestHash !== hash) throw new ConflictError()
      const lines = await tx
        .select({ id: statementLines.id })
        .from(statementLines)
        .where(eq(statementLines.importId, replay.id))
      return {
        id: replay.id,
        imported: lines.length,
        skipped: input.rows.length - lines.length,
      }
    }
    const keys = input.rows.map(fingerprint)
    const previous = await tx
      .select({ fingerprint: statementLines.fingerprint })
      .from(statementLines)
      .where(
        and(
          eq(statementLines.organizationId, input.organizationId),
          eq(statementLines.accountId, input.accountId),
          inArray(statementLines.fingerprint, keys),
        ),
      )
    const seen = new Set(previous.map((line) => line.fingerprint))
    const accepted = input.rows.filter((row) => {
      const key = fingerprint(row)
      const duplicate = seen.has(key)
      seen.add(key)
      return input.includeDuplicates || !duplicate
    })
    const [saved] = await tx
      .insert(statementImports)
      .values({
        organizationId: input.organizationId,
        accountId: input.accountId,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
      })
      .returning()
    if (accepted.length)
      await tx.insert(statementLines).values(
        accepted.map((row) => ({
          ...row,
          description: row.description.trim(),
          organizationId: input.organizationId,
          importId: saved.id,
          accountId: input.accountId,
          fingerprint: fingerprint(row),
        })),
      )
    await tx.insert(auditEvents).values({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'statement.imported',
      data: {
        importId: saved.id,
        accountId: input.accountId,
        imported: accepted.length,
        skipped: input.rows.length - accepted.length,
        includeDuplicates: input.includeDuplicates,
      },
    })
    return {
      id: saved.id,
      imported: accepted.length,
      skipped: input.rows.length - accepted.length,
    }
  })
}
export async function listStatementLines(input: Identity) {
  if (!uuidPattern.test(input.accountId)) throw new InvalidInputError()
  await accountAccess(input, false)
  return getDb()
    .select()
    .from(statementLines)
    .where(
      and(
        eq(statementLines.organizationId, input.organizationId),
        eq(statementLines.accountId, input.accountId),
      ),
    )
    .orderBy(desc(statementLines.date), desc(statementLines.createdAt))
    .limit(500)
}
export async function listMatchCandidates(input: Identity) {
  if (!uuidPattern.test(input.accountId)) throw new InvalidInputError()
  await accountAccess(input, false)
  return getDb()
    .select({
      id: journalEntries.id,
      date: journalEntries.date,
      description: journalEntries.description,
      amountCents: sql<string>`sum(case when ${journalLines.side}='debit' then ${journalLines.amountCents} else -${journalLines.amountCents} end)::text`,
    })
    .from(journalEntries)
    .innerJoin(
      journalLines,
      and(
        eq(journalLines.entryId, journalEntries.id),
        eq(journalLines.organizationId, journalEntries.organizationId),
      ),
    )
    .where(
      and(
        eq(journalEntries.organizationId, input.organizationId),
        eq(journalEntries.status, 'posted'),
        eq(journalLines.accountId, input.accountId),
      ),
    )
    .groupBy(journalEntries.id, journalEntries.date, journalEntries.description)
    .orderBy(desc(journalEntries.date))
    .limit(500)
}
export async function reconcileLine(
  input: Identity & {
    lineId: string
    entryId: string | null
    expectedVersion: number
  },
) {
  if (
    !uuidPattern.test(input.lineId) ||
    (input.entryId !== null && !uuidPattern.test(input.entryId)) ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  )
    throw new InvalidInputError()
  await accountAccess(input, true)
  try {
    return await getDb().transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, input.organizationId),
            eq(memberships.userId, input.actorId),
          ),
        )
        .for('share')
      if (!member || !['owner', 'admin'].includes(member.role))
        throw new ForbiddenError()
      const [line] = await tx
        .select()
        .from(statementLines)
        .where(
          and(
            eq(statementLines.organizationId, input.organizationId),
            eq(statementLines.accountId, input.accountId),
            eq(statementLines.id, input.lineId),
          ),
        )
        .for('update')
      if (!line) throw new ForbiddenError()
      if (line.matchedEntryId === input.entryId) return line
      if (line.version !== input.expectedVersion) throw new ConflictError()
      if (input.entryId) {
        const [candidate] = await tx
          .select({
            amountCents: sql<string>`sum(case when ${journalLines.side}='debit' then ${journalLines.amountCents} else -${journalLines.amountCents} end)::text`,
          })
          .from(journalEntries)
          .innerJoin(
            journalLines,
            and(
              eq(journalLines.entryId, journalEntries.id),
              eq(journalLines.organizationId, journalEntries.organizationId),
            ),
          )
          .where(
            and(
              eq(journalEntries.id, input.entryId),
              eq(journalEntries.organizationId, input.organizationId),
              eq(journalEntries.status, 'posted'),
              eq(journalLines.accountId, input.accountId),
            ),
          )
        if (
          !candidate ||
          BigInt(candidate.amountCents) !== BigInt(line.amountCents)
        )
          throw new InvalidInputError()
      }
      const [saved] = await tx
        .update(statementLines)
        .set({ matchedEntryId: input.entryId, version: line.version + 1 })
        .where(eq(statementLines.id, line.id))
        .returning()
      await tx.insert(auditEvents).values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.entryId ? 'statement.matched' : 'statement.unmatched',
        entryId: input.entryId,
        data: {
          lineId: line.id,
          before: line.matchedEntryId,
          after: input.entryId,
        },
      })
      return saved
    })
  } catch (error) {
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code
    if (code === '23505') throw new ConflictError()
    throw error
  }
}
