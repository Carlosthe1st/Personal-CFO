import type { NextRequest } from 'next/server'
import { authenticated, json } from '../../../../../server/http'
import { listAccounts } from '../../../../../server/organizations'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return authenticated(request, async (userId) =>
    json(await listAccounts((await context.params).organizationId, userId)),
  )
}
