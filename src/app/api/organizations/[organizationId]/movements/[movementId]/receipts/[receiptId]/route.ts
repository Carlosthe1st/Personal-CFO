import type { NextRequest } from 'next/server'
import { authenticated, json } from '../../../../../../../../server/http'
import { ForbiddenError } from '../../../../../../../../server/authorization'
import {
  detachReceipt,
  downloadReceipt,
} from '../../../../../../../../server/receipts'

type Context = {
  params: Promise<{
    organizationId: string
    movementId: string
    receiptId: string
  }>
}

export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const { receiptId, ...identity } = await context.params
    const result = await downloadReceipt({ ...identity, actorId }, receiptId)
    return new Response(Buffer.from(result.body), {
      headers: {
        'content-type': result.mime,
        'content-disposition': `attachment; filename="comprovativo"; filename*=UTF-8''${encodeURIComponent(result.name)}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  })
}

export async function DELETE(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const host = request.headers.get('host')
    const expectedOrigin = host
      ? `${request.nextUrl.protocol}//${host}`
      : request.nextUrl.origin
    if (request.headers.get('origin') !== expectedOrigin)
      throw new ForbiddenError()
    const { receiptId, ...identity } = await context.params
    return json(await detachReceipt({ ...identity, actorId }, receiptId))
  })
}
