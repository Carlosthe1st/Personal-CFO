import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { movements, accounts, type MovementType } from '../db/schema'
import {
  requireMember,
  InvalidInputError,
  ConflictError,
  ForbiddenError,
  uuidPattern,
} from './authorization'
import { postJournalInTransaction } from './journal'

export type MovementInput = {
  organizationId: string
  actorId: string
  type: MovementType
  date: string
  description: string
  amountCents: number
  financialAccountId: string
  counterAccountId: string
  idempotencyKey: string
}
export async function createMovement(input: MovementInput) {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
  ])
  if (
    !['income', 'expense', 'transfer'].includes(input.type) ||
    !uuidPattern.test(input.financialAccountId) ||
    !uuidPattern.test(input.counterAccountId) ||
    input.financialAccountId === input.counterAccountId ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey)
  )
    throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
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
      input.type === 'income'
        ? input.financialAccountId
        : input.counterAccountId
    const credit =
      input.type === 'income'
        ? input.counterAccountId
        : input.financialAccountId
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
  })
}
export async function listMovements(organizationId: string, actorId: string) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  return getDb()
    .select()
    .from(movements)
    .where(eq(movements.organizationId, organizationId))
    .orderBy(desc(movements.date), desc(movements.createdAt))
}
