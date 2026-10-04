import type { NextRequest } from 'next/server'
import { authenticated, json } from '../../../../../server/http'
import { getReports } from '../../../../../server/reports'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return authenticated(request, async (actorId) =>
    json(
      await getReports(
        (await context.params).organizationId,
        actorId,
        request.nextUrl.searchParams.get('from') ?? '',
        request.nextUrl.searchParams.get('to') ?? '',
        request.nextUrl.searchParams.get('accountId') || undefined,
      ),
    ),
  )
}
