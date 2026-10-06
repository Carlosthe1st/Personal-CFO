import type { NextRequest } from 'next/server'
import {
  authenticated,
  json,
  requestBody,
} from '../../../../../../../../server/http'
import { InvalidInputError } from '../../../../../../../../server/authorization'
import {
  confirmOccurrence,
  skipOccurrence,
} from '../../../../../../../../server/recurrences'

type Context = {
  params: Promise<{ organizationId: string; ruleId: string; date: string }>
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request)
    const { date, ...params } = await context.params
    const identity = { ...params, actorId, dueDate: date }
    if (body.action === 'confirm')
      return json(await confirmOccurrence(identity))
    if (body.action === 'skip') return json(await skipOccurrence(identity))
    if (body.action === 'postpone' && typeof body.postponedUntil === 'string')
      return json(
        await skipOccurrence({
          ...identity,
          postponedUntil: body.postponedUntil,
        }),
      )
    throw new InvalidInputError()
  })
}
