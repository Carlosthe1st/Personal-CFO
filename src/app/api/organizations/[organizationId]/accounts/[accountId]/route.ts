import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../../server/http'
import { updateAccount } from '../../../../../../server/accounts'
import { InvalidInputError } from '../../../../../../server/authorization'
import type { AccountKind } from '../../../../../../db/schema'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; accountId: string }> },
) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (
      typeof body.code !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.kind !== 'string' ||
      typeof body.active !== 'boolean' ||
      typeof body.expectedVersion !== 'number'
    )
      throw new InvalidInputError()
    return json(
      await updateAccount({
        ...(await context.params),
        actorId,
        code: body.code,
        name: body.name,
        kind: body.kind as AccountKind,
        active: body.active,
        expectedVersion: body.expectedVersion,
      }),
    )
  })
}
