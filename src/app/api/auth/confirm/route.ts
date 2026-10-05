import type { NextRequest } from 'next/server'
import { resolveConfirmationChallenge } from '../../../../server/login-confirmation'

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') ?? ''
  let sameHost = false
  try {
    const posted = new URL(origin)
    sameHost =
      posted.host === request.headers.get('host') &&
      (posted.protocol === 'https:' ||
        (posted.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(posted.hostname)))
  } catch {
    sameHost = false
  }
  if (
    !sameHost ||
    !request.headers
      .get('content-type')
      ?.startsWith('application/x-www-form-urlencoded')
  )
    return new Response('Pedido inválido.', { status: 403 })
  const body = await request.text()
  if (body.length > 5000)
    return new Response('Pedido inválido.', { status: 400 })
  try {
    const challenge = new URLSearchParams(body).get('c') ?? ''
    return Response.redirect(
      resolveConfirmationChallenge(challenge, origin),
      303,
    )
  } catch {
    return Response.redirect(
      new URL('/api/auth/signin?error=Verification', origin),
      303,
    )
  }
}
