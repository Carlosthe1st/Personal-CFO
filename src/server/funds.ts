import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { funds } from '../db/schema'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  requireMember,
  uuidPattern,
} from './authorization'

function validName(name: string) {
  const cleaned = name.trim()
  if (!cleaned || cleaned.length > 100) throw new InvalidInputError()
  return cleaned
}

export async function listFunds(organizationId: string, actorId: string) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  return getDb()
    .select()
    .from(funds)
    .where(eq(funds.organizationId, organizationId))
    .orderBy(asc(funds.name))
}

export async function createFund(input: {
  organizationId: string
  actorId: string
  name: string
}) {
  await requireMember(input.actorId, input.organizationId, ['owner', 'admin'])
  const [row] = await getDb()
    .insert(funds)
    .values({
      organizationId: input.organizationId,
      name: validName(input.name),
    })
    .onConflictDoNothing()
    .returning()
  if (!row) throw new ConflictError()
  return row
}

export async function updateFund(input: {
  organizationId: string
  actorId: string
  fundId: string
  name: string
  active: boolean
}) {
  await requireMember(input.actorId, input.organizationId, ['owner', 'admin'])
  if (!uuidPattern.test(input.fundId) || typeof input.active !== 'boolean')
    throw new InvalidInputError()
  const [row] = await getDb()
    .update(funds)
    .set({
      name: validName(input.name),
      active: input.active,
      version: sql`${funds.version} + 1`,
    })
    .where(
      and(
        eq(funds.organizationId, input.organizationId),
        eq(funds.id, input.fundId),
      ),
    )
    .returning()
  if (!row) throw new ForbiddenError()
  return row
}
