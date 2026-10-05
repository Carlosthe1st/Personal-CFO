import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { InvalidInputError } from '../../../../../server/authorization'
import { createMovement, listMovements } from '../../../../../server/movements'
import type { MovementType } from '../../../../../db/schema'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (userId) =>
    json(await listMovements((await context.params).organizationId, userId)),
  )
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (userId) => {
    const body = await requestBody(request)
    if (
      typeof body.type !== 'string' ||
      typeof body.date !== 'string' ||
      typeof body.description !== 'string' ||
      typeof body.amountCents !== 'number' ||
      typeof body.financialAccountId !== 'string' ||
      typeof body.counterAccountId !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      (body.fundId !== undefined &&
        body.fundId !== null &&
        typeof body.fundId !== 'string')
    )
      throw new InvalidInputError()
    return json(
      await createMovement({
        organizationId: (await context.params).organizationId,
        actorId: userId,
        type: body.type as MovementType,
        date: body.date,
        description: body.description,
        amountCents: body.amountCents,
        financialAccountId: body.financialAccountId,
        counterAccountId: body.counterAccountId,
        idempotencyKey: body.idempotencyKey,
        fundId: (body.fundId as string | null | undefined) ?? null,
      }),
      201,
    )
  })
}
