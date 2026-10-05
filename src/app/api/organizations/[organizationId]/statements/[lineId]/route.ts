import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../../server/http'
import { InvalidInputError } from '../../../../../../server/authorization'
import { reconcileLine } from '../../../../../../server/statements'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; lineId: string }> },
) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (
      typeof body.accountId !== 'string' ||
      (body.entryId !== null && typeof body.entryId !== 'string') ||
      typeof body.expectedVersion !== 'number'
    )
      throw new InvalidInputError()
    return json(
      await reconcileLine({
        ...(await context.params),
        actorId,
        accountId: body.accountId,
        entryId: body.entryId,
        expectedVersion: body.expectedVersion,
      }),
    )
  })
}
