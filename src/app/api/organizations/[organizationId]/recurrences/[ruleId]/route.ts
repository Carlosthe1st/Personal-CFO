import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../../server/http'
import { InvalidInputError } from '../../../../../../server/authorization'
import { updateRecurrence } from '../../../../../../server/recurrences'

type Context = { params: Promise<{ organizationId: string; ruleId: string }> }
export async function PATCH(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (
      typeof body.type !== 'string' ||
      typeof body.frequency !== 'string' ||
      typeof body.startDate !== 'string' ||
      typeof body.description !== 'string' ||
      typeof body.amountCents !== 'number' ||
      typeof body.financialAccountId !== 'string' ||
      typeof body.counterAccountId !== 'string' ||
      typeof body.active !== 'boolean' ||
      (body.endDate !== null &&
        body.endDate !== undefined &&
        typeof body.endDate !== 'string') ||
      (body.fundId !== null &&
        body.fundId !== undefined &&
        typeof body.fundId !== 'string')
    )
      throw new InvalidInputError()
    return json(
      await updateRecurrence({
        ...(await context.params),
        actorId,
        type: body.type as 'income' | 'expense',
        frequency: body.frequency as 'weekly' | 'monthly',
        startDate: body.startDate,
        endDate: (body.endDate as string | null | undefined) ?? null,
        description: body.description,
        amountCents: body.amountCents,
        financialAccountId: body.financialAccountId,
        counterAccountId: body.counterAccountId,
        fundId: (body.fundId as string | null | undefined) ?? null,
        active: body.active,
      }),
    )
  })
}
