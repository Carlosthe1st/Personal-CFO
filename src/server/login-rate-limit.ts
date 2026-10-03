import { createHmac } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'

function key(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex')
}

function blocked() {
  return new Response('Demasiados pedidos. Tenta novamente mais tarde.', {
    status: 429,
    headers: { 'retry-after': '900' },
  })
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
  if (ipAttempts > 10) return blocked()
  const emailAttempts = email ? await consume(key(secret, `email:${email}`)) : 0
  if (emailAttempts > 3) return blocked()
  return null
}

export async function consumeLoginAttempt(keyHash: string): Promise<number> {
  await getDb().execute(sql`
    delete from login_rate_limits
    where key_hash in (
      select key_hash from login_rate_limits
      where window_start < now() - interval '1 day'
      order by window_start
      limit 100
      for update skip locked
    )
  `)
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
