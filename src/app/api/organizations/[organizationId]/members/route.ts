import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { InvalidInputError } from '../../../../../server/authorization'
import { setMember } from '../../../../../server/organizations'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return authenticated(request, async (userId) => {
    const body = await requestBody(request)
    if (typeof body.email !== 'string' || typeof body.role !== 'string')
      throw new InvalidInputError()
    return json(
      await setMember(
        (await context.params).organizationId,
        userId,
        body.email,
        body.role,
      ),
    )
  })
}
