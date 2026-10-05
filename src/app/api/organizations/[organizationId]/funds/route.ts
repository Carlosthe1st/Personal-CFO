import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { InvalidInputError } from '../../../../../server/authorization'
import { createFund, listFunds } from '../../../../../server/funds'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) =>
    json(await listFunds((await context.params).organizationId, actorId)),
  )
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (typeof body.name !== 'string') throw new InvalidInputError()
    return json(
      await createFund({
        organizationId: (await context.params).organizationId,
        actorId,
        name: body.name,
      }),
      201,
    )
  })
}
