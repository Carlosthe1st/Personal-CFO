import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { listAccounts } from '../../../../../server/organizations'
import { createAccount } from '../../../../../server/accounts'
import { InvalidInputError } from '../../../../../server/authorization'
import type { AccountKind } from '../../../../../db/schema'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return authenticated(request, async (userId) =>
    json(await listAccounts((await context.params).organizationId, userId)),
  )
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (
      typeof body.code !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.kind !== 'string'
    )
      throw new InvalidInputError()
    return json(
      await createAccount({
        organizationId: (await context.params).organizationId,
        actorId,
        code: body.code,
        name: body.name,
        kind: body.kind as AccountKind,
        bankCountry: body.bankCountry as string | null | undefined,
        bankName: body.bankName as string | null | undefined,
      }),
      201,
    )
  })
}
