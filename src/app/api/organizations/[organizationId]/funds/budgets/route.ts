import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../../server/http'
import { InvalidInputError } from '../../../../../../server/authorization'
import {
  changeFundBudget,
  getFundBudget,
} from '../../../../../../server/fund-budgets'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) =>
    json(
      await getFundBudget(
        (await context.params).organizationId,
        actorId,
        Number(request.nextUrl.searchParams.get('year')),
      ),
    ),
  )
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    if (
      typeof body.year !== 'number' ||
      typeof body.operationId !== 'string' ||
      typeof body.reason !== 'string' ||
      typeof body.mode !== 'string' ||
      typeof body.amountCents !== 'number' ||
      !body.to ||
      typeof body.to !== 'object' ||
      Array.isArray(body.to)
    )
      throw new InvalidInputError()
    const address = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new InvalidInputError()
      const row = value as Record<string, unknown>
      if (typeof row.fundId !== 'string' || typeof row.month !== 'number')
        throw new InvalidInputError()
      return { fundId: row.fundId, month: row.month }
    }
    return json(
      await changeFundBudget({
        organizationId: (await context.params).organizationId,
        actorId,
        year: body.year,
        operationId: body.operationId,
        reason: body.reason,
        mode: body.mode as 'revise' | 'transfer',
        amountCents: body.amountCents,
        to: address(body.to),
        from: body.from === undefined ? undefined : address(body.from),
      }),
    )
  })
}
