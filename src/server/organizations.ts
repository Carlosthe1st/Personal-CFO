import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { organizations, memberships, accounts } from '../db/schema'
import {
  InvalidInputError,
  UnauthorizedError,
  uuidPattern,
  requireMember,
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
    await tx
      .insert(memberships)
      .values({
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
