import 'server-only'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { organizations, memberships, accounts, users } from '../db/schema'
import {
  InvalidInputError,
  UnauthorizedError,
  uuidPattern,
  requireMember,
  ForbiddenError,
} from './authorization'

export async function createOrganization(ownerId: string, name: string) {
  if (!uuidPattern.test(ownerId)) throw new UnauthorizedError()
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120)
    throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: name.trim() })
      .returning({ id: organizations.id, name: organizations.name })
    await tx.insert(memberships).values({
      organizationId: organization.id,
      userId: ownerId,
      role: 'owner',
    })
    await tx.insert(accounts).values(
      [
        { code: 'CAIXA', name: 'Caixa' },
        { code: 'BANCO', name: 'Banco' },
        { code: 'DESPESA', name: 'Despesas' },
        { code: 'RENDIMENTO', name: 'Rendimentos' },
        { code: 'ABERTURA', name: 'Contrapartida de abertura' },
      ].map((account) => ({ ...account, organizationId: organization.id })),
    )
    return organization
  })
}
export async function setMember(
  organizationId: string,
  actorId: string,
  email: string,
  role: string,
) {
  await requireMember(actorId, organizationId, ['owner', 'admin'])
  if (
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !['admin', 'editor', 'reader'].includes(role)
  )
    throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for('update')
    const [actor] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, actorId),
        ),
      )
      .for('update')
    if (!actor || !['owner', 'admin'].includes(actor.role))
      throw new ForbiddenError()
    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
    if (!target) throw new InvalidInputError()
    const [existing] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, target.id),
        ),
      )
      .for('update')
    if (
      existing?.role === 'owner' ||
      (actor.role === 'admin' &&
        (role === 'admin' || existing?.role === 'admin'))
    )
      throw new ForbiddenError()
    await tx
      .insert(memberships)
      .values({
        organizationId,
        userId: target.id,
        role: role as 'admin' | 'editor' | 'reader',
      })
      .onConflictDoUpdate({
        target: [memberships.organizationId, memberships.userId],
        set: { role: role as 'admin' | 'editor' | 'reader' },
      })
    return { userId: target.id, role }
  })
}
export async function listOrganizations(userId: string) {
  if (!uuidPattern.test(userId)) throw new UnauthorizedError()
  return getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.name)
}
export async function listAccounts(organizationId: string, userId: string) {
  await requireMember(userId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  return getDb()
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      active: accounts.active,
    })
    .from(accounts)
    .where(eq(accounts.organizationId, organizationId))
    .orderBy(accounts.code)
}
