import type { NextRequest } from 'next/server'
import { authenticated } from '../../../../../../server/http'
import { exportReport } from '../../../../../../server/report-export'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return authenticated(request, async (actorId) => {
    const result = await exportReport({
      organizationId: (await context.params).organizationId,
      actorId,
      from: request.nextUrl.searchParams.get('from') ?? '',
      to: request.nextUrl.searchParams.get('to') ?? '',
      accountId: request.nextUrl.searchParams.get('accountId') || undefined,
      fundId: request.nextUrl.searchParams.get('fundId') || undefined,
      format: request.nextUrl.searchParams.get('format') as 'csv' | 'pdf',
    })
    return new Response(Buffer.from(result.body), {
      headers: {
        'content-type': result.contentType,
        'content-disposition': `attachment; filename="${result.filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  })
}
