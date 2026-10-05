import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  movements,
  movementChanges,
  accounts,
  auditEvents,
  memberships,
  funds,
  type MovementType,
} from '../db/schema'
import {
  requireMember,
  InvalidInputError,
  ConflictError,
  ForbiddenError,
  uuidPattern,
} from './authorization'
import {
  postJournalInTransaction,
  reverseJournalInTransaction,
} from './journal'
import type { JournalTransaction } from './journal'

export type MovementInput = {
  organizationId: string
  actorId: string
  type: MovementType
  date: string
  description: string
  amountCents: number
  financialAccountId: string
  counterAccountId: string
  fundId?: string | null
  idempotencyKey: string
}
export async function createMovement(input: MovementInput) {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
  ])
  return getDb().transaction((tx) => createMovementInTransaction(tx, input))
}
async function createMovementInTransaction(
  tx: JournalTransaction,
  input: MovementInput,
) {
  if (
    !['income', 'expense', 'transfer'].includes(input.type) ||
    !uuidPattern.test(input.financialAccountId) ||
    !uuidPattern.test(input.counterAccountId) ||
    input.financialAccountId === input.counterAccountId ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey)
  )
    throw new InvalidInputError()
  if (input.fundId && !uuidPattern.test(input.fundId))
    throw new InvalidInputError()
  if (input.type === 'transfer' && input.fundId) throw new InvalidInputError()
  if (input.fundId) {
    const [fund] = await tx
      .select({ id: funds.id })
      .from(funds)
      .where(
        and(
          eq(funds.organizationId, input.organizationId),
          eq(funds.id, input.fundId),
          eq(funds.active, true),
        ),
      )
      .for('share')
    if (!fund) throw new ForbiddenError()
  }
  const selected = await tx
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.organizationId, input.organizationId),
        inArray(accounts.id, [
          input.financialAccountId,
          input.counterAccountId,
        ]),
        eq(accounts.active, true),
      ),
    )
    .for('share')
  if (selected.length !== 2) throw new ForbiddenError()
  const financial = selected.find(
    (account) => account.id === input.financialAccountId,
  )!
  const counter = selected.find(
    (account) => account.id === input.counterAccountId,
  )!
  if (
    !['cash', 'bank'].includes(financial.kind) ||
    (input.type === 'transfer'
      ? !['cash', 'bank'].includes(counter.kind)
      : counter.kind !== input.type)
  )
    throw new InvalidInputError()
  const debit =
    input.type === 'income' ? input.financialAccountId : input.counterAccountId
  const credit =
    input.type === 'income' ? input.counterAccountId : input.financialAccountId
  const journal = await postJournalInTransaction(tx, {
    ...input,
    idempotencyKey: `movement_${createHash('sha256').update(input.idempotencyKey).digest('hex')}`,
    lines: [
      { accountId: debit, side: 'debit', amountCents: input.amountCents },
      { accountId: credit, side: 'credit', amountCents: input.amountCents },
    ],
  })
  const values = {
    organizationId: input.organizationId,
    actorId: input.actorId,
    type: input.type,
    date: input.date,
    description: input.description,
    amountCents: input.amountCents,
    financialAccountId: input.financialAccountId,
    counterAccountId: input.counterAccountId,
    fundId: input.fundId ?? null,
    idempotencyKey: input.idempotencyKey,
    journalEntryId: journal.id,
  }
  const [saved] = await tx
    .insert(movements)
    .values(values)
    .onConflictDoNothing({
      target: [movements.organizationId, movements.idempotencyKey],
    })
    .returning()
  const [existing] = saved
    ? [saved]
    : await tx
        .select()
        .from(movements)
        .where(
          and(
            eq(movements.organizationId, input.organizationId),
            eq(movements.idempotencyKey, input.idempotencyKey),
          ),
        )
  if (
    !existing ||
    Object.entries(values).some(
      ([key, value]) => existing[key as keyof typeof existing] !== value,
    )
  )
    throw new ConflictError()
  return { id: existing.id, journalEntryId: existing.journalEntryId }
}
export async function listMovements(organizationId: string, actorId: string) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  const rows = await getDb()
    .select()
    .from(movements)
    .where(eq(movements.organizationId, organizationId))
    .orderBy(desc(movements.date), desc(movements.createdAt))
  const changes = await getDb()
    .select()
    .from(movementChanges)
    .where(eq(movementChanges.organizationId, organizationId))
  return rows.map((row) => {
    const change = changes.find((event) => event.movementId === row.id)
    return {
      ...row,
      status: change
        ? change.replacementMovementId
          ? 'corrected'
          : 'removed'
        : 'active',
      change: change ?? null,
    }
  })
}

export type MovementChangeInput = {
  organizationId: string
  actorId: string
  movementId: string
  idempotencyKey: string
  reason: string
  replacement?: Omit<MovementInput, 'actorId' | 'idempotencyKey'>
}
export async function changeMovement(input: MovementChangeInput) {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
  ])
  if (
    !uuidPattern.test(input.movementId) ||
    typeof input.reason !== 'string' ||
    !input.reason.trim() ||
    input.reason.length > 500 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey)
  )
    throw new InvalidInputError()
  const replacement = input.replacement
    ? {
        organizationId: input.replacement.organizationId,
        type: input.replacement.type,
        date: input.replacement.date,
        description: input.replacement.description,
        amountCents: input.replacement.amountCents,
        financialAccountId: input.replacement.financialAccountId,
        counterAccountId: input.replacement.counterAccountId,
        fundId: input.replacement.fundId ?? null,
      }
    : undefined
  if (replacement)
    await requireMember(input.actorId, replacement.organizationId, [
      'owner',
      'admin',
      'editor',
    ])
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        actorId: input.actorId,
        movementId: input.movementId,
        reason: input.reason,
        replacement,
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
    if (!member || !['owner', 'admin', 'editor'].includes(member.role))
      throw new ForbiddenError()
    if (replacement) {
      const [destinationMember] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, replacement.organizationId),
            eq(memberships.userId, input.actorId),
          ),
        )
        .for('share')
      if (
        !destinationMember ||
        !['owner', 'admin', 'editor'].includes(destinationMember.role)
      )
        throw new ForbiddenError()
    }
    const [original] = await tx
      .select()
      .from(movements)
      .where(
        and(
          eq(movements.id, input.movementId),
          eq(movements.organizationId, input.organizationId),
        ),
      )
      .for('update')
    if (!original) throw new ForbiddenError()
    const [existing] = await tx
      .select()
      .from(movementChanges)
      .where(eq(movementChanges.movementId, original.id))
    if (existing) {
      if (
        existing.idempotencyKey !== input.idempotencyKey ||
        existing.requestHash !== requestHash
      )
        throw new ConflictError()
      return {
        id: existing.id,
        reversalEntryId: existing.reversalEntryId,
        replacementMovementId: existing.replacementMovementId,
      }
    }
    const reversal = await reverseJournalInTransaction(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      entryId: original.journalEntryId,
    })
    const saved = replacement
      ? await createMovementInTransaction(tx, {
          ...replacement,
          actorId: input.actorId,
          idempotencyKey: `replacement_${original.id}`,
        })
      : undefined
    const [event] = await tx
      .insert(movementChanges)
      .values({
        organizationId: input.organizationId,
        movementId: original.id,
        actorId: input.actorId,
        reversalEntryId: reversal.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        reason: input.reason,
        replacementOrganizationId: replacement?.organizationId,
        replacementMovementId: saved?.id,
      })
      .onConflictDoNothing()
      .returning()
    if (!event) throw new ConflictError()
    await tx.insert(auditEvents).values({
      organizationId: input.organizationId,
      actorId: input.actorId,
      entryId: original.journalEntryId,
      action: saved ? 'movement.corrected' : 'movement.removed',
      data: {
        changeId: event.id,
        reversalEntryId: reversal.id,
        reason: input.reason,
        replacementOrganizationId: replacement?.organizationId,
        replacementMovementId: saved?.id,
      },
    })
    if (saved && replacement)
      await tx.insert(auditEvents).values({
        organizationId: replacement.organizationId,
        actorId: input.actorId,
        entryId: saved.journalEntryId,
        action: 'movement.replacement',
        data: {
          changeId: event.id,
          originalOrganizationId: input.organizationId,
          originalMovementId: original.id,
          reason: input.reason,
        },
      })
    return {
      id: event.id,
      reversalEntryId: reversal.id,
      replacementMovementId: event.replacementMovementId,
    }
  })
}
