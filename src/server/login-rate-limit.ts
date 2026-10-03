import { createHmac } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'

function key(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export async function guardLoginRequest(
  request: Request,
  body: string,
  consume: (key: string) => Promise<number>,
  secret: string,
): Promise<Response | null> {
  if (!new URL(request.url).pathname.endsWith('/api/auth/signin/nodemailer'))
    return null

  const ip = request.headers.get('x-vercel-forwarded-for') ?? 'unknown'
  const email = new URLSearchParams(body).get('email')?.trim().toLowerCase()
  const ipAttempts = await consume(key(secret, `ip:${ip}`))
  const emailAttempts = email ? await consume(key(secret, `email:${email}`)) : 0
  if (ipAttempts <= 10 && emailAttempts <= 3) return null
  return new Response('Demasiados pedidos. Tenta novamente mais tarde.', {
    status: 429,
    headers: { 'retry-after': '900' },
  })
}

export async function consumeLoginAttempt(keyHash: string): Promise<number> {
  const result = await getDb().execute(sql`
    insert into login_rate_limits (key_hash, window_start, attempts)
    values (${keyHash}, now(), 1)
    on conflict (key_hash) do update set
      attempts = case
        when login_rate_limits.window_start <= now() - interval '15 minutes'
          then 1
        else login_rate_limits.attempts + 1
      end,
      window_start = case
        when login_rate_limits.window_start <= now() - interval '15 minutes'
          then now()
        else login_rate_limits.window_start
      end
    returning attempts
  `)
  return Number(result.rows[0].attempts)
}
