import 'server-only'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { memberships, type MemberRole } from '../db/schema'

export class UnauthorizedError extends Error {
  readonly status = 401
}
export class ForbiddenError extends Error {
  readonly status = 403
}
export class InvalidInputError extends Error {
  readonly status = 400
}
export class PayloadTooLargeError extends Error {
  readonly status = 413
}
export class ConflictError extends Error {
  readonly status = 409
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function requireMember(
  userId: string,
  organizationId: string,
  allowed: readonly MemberRole[],
): Promise<MemberRole> {
  if (!userId || !uuidPattern.test(userId)) throw new UnauthorizedError()
  if (!uuidPattern.test(organizationId)) throw new ForbiddenError()
  const [member] = await getDb()
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
      ),
    )
  if (!member || !allowed.includes(member.role)) throw new ForbiddenError()
  return member.role
}
