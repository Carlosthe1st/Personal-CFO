import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../../server/http'
import { InvalidInputError } from '../../../../../../server/authorization'
import {
  getBudget,
  reviseBudget,
  transferBudget,
  type BudgetCell,
} from '../../../../../../server/budgets'
type Context = { params: Promise<{ organizationId: string; year: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const params = await context.params
    return json(
      await getBudget(params.organizationId, actorId, Number(params.year)),
    )
  })
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const params = await context.params,
      body = await requestBody(request)
    if (
      typeof body.expectedVersion !== 'number' ||
      typeof body.idempotencyKey !== 'string' ||
      (body.reason !== undefined && typeof body.reason !== 'string')
    )
      throw new InvalidInputError()
    const identity = {
      organizationId: params.organizationId,
      actorId,
      year: Number(params.year),
      expectedVersion: body.expectedVersion,
      idempotencyKey: body.idempotencyKey,
      reason: body.reason as string | undefined,
    }
    if (body.action === 'revise') {
      if (
        (body.annualCents !== undefined &&
          typeof body.annualCents !== 'number') ||
        (body.cells !== undefined && !Array.isArray(body.cells))
      )
        throw new InvalidInputError()
      return json(
        await reviseBudget({
          ...identity,
          annualCents: body.annualCents as number | undefined,
          cells: body.cells as BudgetCell[] | undefined,
        }),
      )
    }
    if (body.action === 'transfer') {
      if (
        !body.from ||
        typeof body.from !== 'object' ||
        !body.to ||
        typeof body.to !== 'object' ||
        typeof body.amountCents !== 'number'
      )
        throw new InvalidInputError()
      const from = body.from as Record<string, unknown>,
        to = body.to as Record<string, unknown>
      if (
        typeof from.month !== 'number' ||
        typeof from.accountId !== 'string' ||
        typeof to.month !== 'number' ||
        typeof to.accountId !== 'string'
      )
        throw new InvalidInputError()
      return json(
        await transferBudget({
          ...identity,
          from: { month: from.month, accountId: from.accountId },
          to: { month: to.month, accountId: to.accountId },
          amountCents: body.amountCents,
        }),
      )
    }
    throw new InvalidInputError()
  })
}
