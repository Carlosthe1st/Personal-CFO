import type { NextRequest } from 'next/server'
import {
  authenticated,
  json,
  requestBody,
} from '../../../../../../../server/http'
import { InvalidInputError } from '../../../../../../../server/authorization'
import {
  changeMovement,
  type MovementChangeInput,
} from '../../../../../../../server/movements'

type Context = {
  params: Promise<{ organizationId: string; movementId: string }>
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (
      typeof body.reason !== 'string' ||
      typeof body.idempotencyKey !== 'string'
    )
      throw new InvalidInputError()
    let replacement: MovementChangeInput['replacement']
    if (body.replacement !== undefined) {
      if (
        !body.replacement ||
        typeof body.replacement !== 'object' ||
        Array.isArray(body.replacement)
      )
        throw new InvalidInputError()
      const candidate = body.replacement as Record<string, unknown>
      if (
        typeof candidate.organizationId !== 'string' ||
        typeof candidate.type !== 'string' ||
        typeof candidate.date !== 'string' ||
        typeof candidate.description !== 'string' ||
        typeof candidate.amountCents !== 'number' ||
        typeof candidate.financialAccountId !== 'string' ||
        typeof candidate.counterAccountId !== 'string' ||
        (candidate.fundId !== undefined &&
          candidate.fundId !== null &&
          typeof candidate.fundId !== 'string')
      )
        throw new InvalidInputError()
      replacement = {
        organizationId: candidate.organizationId,
        type: candidate.type as NonNullable<typeof replacement>['type'],
        date: candidate.date,
        description: candidate.description,
        amountCents: candidate.amountCents,
        financialAccountId: candidate.financialAccountId,
        counterAccountId: candidate.counterAccountId,
        fundId: (candidate.fundId as string | null | undefined) ?? null,
      }
    }
    return json(
      await changeMovement({
        ...(await context.params),
        actorId,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
        replacement,
      }),
    )
  })
}
