import type { NextRequest } from 'next/server'
import type { LedgerLineInput } from '../../../../../db/schema'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { postJournal, listJournal } from '../../../../../server/journal'
import { InvalidInputError } from '../../../../../server/authorization'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (userId) =>
    json(await listJournal((await context.params).organizationId, userId)),
  )
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (userId) => {
    const body = await requestBody(request)
    if (
      typeof body.date !== 'string' ||
      typeof body.description !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !Array.isArray(body.lines)
    )
      throw new InvalidInputError()
    const entry = await postJournal({
      organizationId: (await context.params).organizationId,
      actorId: userId,
      date: body.date,
      description: body.description,
      idempotencyKey: body.idempotencyKey,
      lines: body.lines as LedgerLineInput[],
    })
    return json(entry, 201)
  })
}
