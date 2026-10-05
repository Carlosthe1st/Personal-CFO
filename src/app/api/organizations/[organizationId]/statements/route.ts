import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../../../server/http'
import { InvalidInputError } from '../../../../../server/authorization'
import {
  importStatement,
  previewStatement,
  listStatementLines,
  listMatchCandidates,
} from '../../../../../server/statements'
import type { StatementRow } from '../../../../../lib/statement-csv'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const identity = {
      organizationId: (await context.params).organizationId,
      actorId,
      accountId: request.nextUrl.searchParams.get('accountId') ?? '',
    }
    return json({
      lines: await listStatementLines(identity),
      candidates: await listMatchCandidates(identity),
    })
  })
}
export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const body = await requestBody(request, 250000)
    if (typeof body.accountId !== 'string' || !Array.isArray(body.rows))
      throw new InvalidInputError()
    const input = {
      organizationId: (await context.params).organizationId,
      actorId,
      accountId: body.accountId,
      rows: body.rows as StatementRow[],
    }
    if (body.action === 'preview') return json(await previewStatement(input))
    if (
      body.action === 'import' &&
      typeof body.idempotencyKey === 'string' &&
      typeof body.includeDuplicates === 'boolean'
    )
      return json(
        await importStatement({
          ...input,
          idempotencyKey: body.idempotencyKey,
          includeDuplicates: body.includeDuplicates,
        }),
        201,
      )
    throw new InvalidInputError()
  })
}
