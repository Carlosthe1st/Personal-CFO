import 'server-only'
import type { NextRequest } from 'next/server'
import { auth, authConfigured } from '../auth'
import {
  UnauthorizedError,
  ForbiddenError,
  InvalidInputError,
  ConflictError,
} from './authorization'

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
export function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError)
    return json({ error: 'Autenticação necessária.' }, 401)
  if (error instanceof ForbiddenError)
    return json({ error: 'Acesso negado.' }, 403)
  if (error instanceof InvalidInputError || error instanceof SyntaxError)
    return json({ error: 'Dados inválidos.' }, 400)
  if (error instanceof ConflictError)
    return json(
      { error: 'Esta operação já foi usada com dados diferentes.' },
      409,
    )
  return json({ error: 'Serviço indisponível. Tenta novamente.' }, 503)
}
export async function authenticated(
  request: NextRequest,
  action: (userId: string) => Promise<Response>,
) {
  try {
    if (!authConfigured()) return errorResponse(new Error())
    const handler = await auth(async (req) => {
      if (!req.auth?.user?.id) throw new UnauthorizedError()
      return action(req.auth.user.id)
    })
    const response = await handler(request, { params: Promise.resolve({}) })
    return response instanceof Response ? response : errorResponse(new Error())
  } catch (error) {
    return errorResponse(error)
  }
}
export async function requestBody(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const expectedOrigin = host
    ? `${request.nextUrl.protocol}//${host}`
    : request.nextUrl.origin
  if (origin !== expectedOrigin) throw new ForbiddenError()
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new InvalidInputError()
  const body: unknown = JSON.parse(await limitedBody(request, 16384))
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new InvalidInputError()
  return body as Record<string, unknown>
}
export async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) throw new InvalidInputError()
  let size = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new InvalidInputError()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
