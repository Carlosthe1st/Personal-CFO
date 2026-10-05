import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../../server/http'
import { InvalidInputError } from '../../../../../../server/authorization'
import { updateFund } from '../../../../../../server/funds'

type Context = { params: Promise<{ organizationId: string; fundId: string }> }
export async function PATCH(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (typeof body.name !== 'string' || typeof body.active !== 'boolean')
      throw new InvalidInputError()
    return json(
      await updateFund({
        ...(await context.params),
        actorId,
        name: body.name,
        active: body.active,
      }),
    )
  })
}
