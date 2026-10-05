import 'server-only'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  accounts,
  memberships,
  auditEvents,
  type AccountKind,
} from '../db/schema'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  requireMember,
  uuidPattern,
} from './authorization'

type AccountInput = {
  organizationId: string
  actorId: string
  code: string
  name: string
  kind: AccountKind
}
function validate(input: AccountInput) {
  if (
    typeof input.code !== 'string' ||
    !/^[A-Za-z0-9_-]{1,30}$/.test(input.code) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.trim().length > 120 ||
    ![
      'cash',
      'bank',
      'asset',
      'liability',
      'equity',
      'income',
      'expense',
      'other',
    ].includes(input.kind)
  )
    throw new InvalidInputError()
}
async function change(
  input: AccountInput & {
    accountId?: string
    expectedVersion?: number
    active?: boolean
  },
) {
  await requireMember(input.actorId, input.organizationId, ['owner', 'admin'])
  validate(input)
  if (
    input.accountId &&
    (!uuidPattern.test(input.accountId) ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion! < 0 ||
      typeof input.active !== 'boolean')
  )
    throw new InvalidInputError()
  try {
    return await getDb().transaction(async (tx) => {
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
      if (!member || !['owner', 'admin'].includes(member.role))
        throw new ForbiddenError()
      const values = {
        code: input.code,
        name: input.name.trim(),
        kind: input.kind,
      }
      let before: typeof accounts.$inferSelect | null = null
      let saved: typeof accounts.$inferSelect
      if (input.accountId) {
        const [existing] = await tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.accountId),
              eq(accounts.organizationId, input.organizationId),
            ),
          )
          .for('update')
        if (!existing) throw new ForbiddenError()
        if (existing.version !== input.expectedVersion)
          throw new ConflictError()
        before = existing
        ;[saved] = await tx
          .update(accounts)
          .set({
            ...values,
            active: input.active,
            version: existing.version + 1,
          })
          .where(eq(accounts.id, existing.id))
          .returning()
      } else {
        const [created] = await tx
          .insert(accounts)
          .values({ ...values, organizationId: input.organizationId })
          .onConflictDoNothing({
            target: [accounts.organizationId, accounts.code],
          })
          .returning()
        if (!created) throw new ConflictError()
        saved = created
      }
      await tx.insert(auditEvents).values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: before ? 'account.updated' : 'account.created',
        data: { before, after: saved },
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
export const createAccount = (input: AccountInput) => change(input)
export const updateAccount = (
  input: AccountInput & {
    accountId: string
    expectedVersion: number
    active: boolean
  },
) => change(input)
