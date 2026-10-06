import type { NextRequest } from 'next/server'
import { authenticated, json } from '../../../../../server/http'
import { getCashForecast } from '../../../../../server/cash-forecast'

type Context = { params: Promise<{ organizationId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) =>
    json(
      await getCashForecast(
        (await context.params).organizationId,
        actorId,
        request.nextUrl.searchParams.get('today') ?? '',
      ),
    ),
  )
}
