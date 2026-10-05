import type { NextRequest } from 'next/server'
import {
  authenticated,
  json,
  limitedBytes,
} from '../../../../../../../server/http'
import {
  ForbiddenError,
  InvalidInputError,
} from '../../../../../../../server/authorization'
import {
  listReceipts,
  uploadReceipt,
} from '../../../../../../../server/receipts'

type Context = {
  params: Promise<{ organizationId: string; movementId: string }>
}

export async function GET(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) =>
    json(await listReceipts({ ...(await context.params), actorId })),
  )
}

export async function POST(request: NextRequest, context: Context) {
  return authenticated(request, async (actorId) => {
    const host = request.headers.get('host')
    const expectedOrigin = host
      ? `${request.nextUrl.protocol}//${host}`
      : request.nextUrl.origin
    if (request.headers.get('origin') !== expectedOrigin)
      throw new ForbiddenError()
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.startsWith('multipart/form-data;'))
      throw new InvalidInputError()
    const bytes = await limitedBytes(request, 5_250_000)
    const bounded = new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bytes,
    })
    const file = (await bounded.formData()).get('file')
    if (!(file instanceof File)) throw new InvalidInputError()
    return json(
      await uploadReceipt({ ...(await context.params), actorId }, file),
      201,
    )
  })
}
