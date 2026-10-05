import { NextRequest } from 'next/server'
import { handlers } from '../../../../auth'
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
    const callback = resolveConfirmationChallenge(challenge, origin)
    const verified = await handlers.GET(
      new NextRequest(callback, { headers: request.headers }),
    )
    const destination = verified.headers.get('location')
    if (
      verified.status !== 302 ||
      !destination ||
      new URL(destination, origin).origin !== origin ||
      new URL(destination, origin).pathname !== '/contabilidade'
    )
      throw new Error('Invalid confirmation')
    const response = new Response(null, {
      status: 303,
      headers: { Location: new URL('/contabilidade', origin).toString() },
    })
    response.headers.set('Cache-Control', 'no-store')
    for (const cookie of verified.headers.getSetCookie())
      response.headers.append('Set-Cookie', cookie)
    return response
  } catch {
    return Response.redirect(
      new URL('/api/auth/signin?error=Verification', origin),
      303,
    )
  }
}
