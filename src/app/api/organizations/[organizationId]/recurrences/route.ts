import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { InvalidInputError } from '../../../../../server/authorization'
import {
  createRecurrence,
  listDueOccurrences,
  listRecurrences,
} from '../../../../../server/recurrences'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const organizationId = (await context.params).organizationId
    const throughDate = request.nextUrl.searchParams.get('throughDate')
    if (throughDate)
      return json(
        await listDueOccurrences(
          organizationId,
          actorId,
          throughDate,
          request.nextUrl.searchParams.get('fromDate') || undefined,
        ),
      )
    return json(await listRecurrences(organizationId, actorId))
  })
}
export async function POST(request: NextRequest, context: Context) {
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
      (body.endDate !== null &&
        body.endDate !== undefined &&
        typeof body.endDate !== 'string') ||
      (body.fundId !== null &&
        body.fundId !== undefined &&
        typeof body.fundId !== 'string')
    )
      throw new InvalidInputError()
    return json(
      await createRecurrence({
        organizationId: (await context.params).organizationId,
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
      }),
      201,
    )
  })
}
