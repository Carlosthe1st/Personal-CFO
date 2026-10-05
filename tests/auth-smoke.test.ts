import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'

describe.skipIf(!process.env.ACCOUNTING_TEST_BASE_URL)(
  'SMTP magic-link production smoke',
  () => {
    it('delivers a magic link, creates a session and never grants automatic membership', async () => {
      const base = process.env.ACCOUNTING_TEST_BASE_URL!
      if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
        throw new Error('Smoke tests require a disposable loopback server')
      let message = ''
      const server = createServer((socket) => {
        socket.write('220 localhost test SMTP\r\n')
        let buffer = '',
          data = false
        socket.on('data', (chunk) => {
          buffer += chunk.toString()
          let end: number
          while ((end = buffer.indexOf('\r\n')) >= 0) {
            const line = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            if (data) {
              if (line === '.') {
                data = false
                socket.write('250 accepted\r\n')
              } else message += line + '\r\n'
            } else if (/^EHLO/i.test(line))
              socket.write('250-localhost\r\n250 8BITMIME\r\n')
            else if (/^DATA/i.test(line)) {
              data = true
              socket.write('354 send message\r\n')
            } else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n')
            else socket.write('250 OK\r\n')
          }
        })
      })
      await new Promise<void>((resolve) =>
        server.listen(25252, '127.0.0.1', resolve),
      )
      const cookies = new Map<string, string>()
      async function request(path: string, init: RequestInit = {}) {
        const response = await fetch(new URL(path, base), {
          ...init,
          redirect: 'manual',
          headers: {
            ...init.headers,
            cookie: [...cookies]
              .map(([key, value]) => `${key}=${value}`)
              .join('; '),
          },
        })
        for (const raw of response.headers.getSetCookie()) {
          const [pair] = raw.split(';')
          const split = pair.indexOf('=')
          cookies.set(pair.slice(0, split), pair.slice(split + 1))
        }
        return response
      }
      try {
        const home = await request('/')
        expect(home.status).toBe(307)
        expect(new URL(home.headers.get('location')!, base).pathname).toBe(
          '/contabilidade',
        )
        const protectedPage = await request('/contabilidade')
        expect(protectedPage.status).toBe(307)
        expect(
          new URL(protectedPage.headers.get('location')!, base).pathname,
        ).toBe('/api/auth/signin')
        const csrf = await (await request('/api/auth/csrf')).json()
        const signin = await request('/api/auth/signin/nodemailer', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            csrfToken: csrf.csrfToken,
            email: `smtp-${Date.now()}@example.test`,
            callbackUrl: `${base}/contabilidade`,
          }),
        })
        expect(signin.status).toBe(302)
        const decoded = message
          .replace(/=\r\n/g, '')
          .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          )
        const link = decoded.match(
          /https?:\/\/[^\s<>]+\/auth\/confirm\?c=[^\s<>]+/,
        )?.[0]
        expect(link).toBeTruthy()
        expect(new URL(link!).origin).toBe(new URL(base).origin)
        expect(new URL(link!).searchParams.get('c')).toMatch(
          /^[A-Za-z0-9_-]{40,4096}$/,
        )
        expect((await request(link!)).status).toBe(200)
        expect(await (await request('/api/auth/session')).json()).toBeNull()
        const confirmed = await request('/api/auth/confirm', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            origin: new URL(base).origin,
          },
          body: new URLSearchParams({
            c: new URL(link!).searchParams.get('c')!,
          }),
        })
        expect(confirmed.status).toBe(303)
        expect(new URL(confirmed.headers.get('location')!).pathname).toBe(
          '/contabilidade',
        )
        expect(confirmed.headers.get('location')).not.toContain('token=')
        const session = await (await request('/api/auth/session')).json()
        expect(session.user.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(await (await request('/api/organizations')).json()).toEqual([])
        expect((await request('/contabilidade')).status).toBe(200)
        const mutation = {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: new URL(base).origin,
          },
        }
        const created = await request('/api/organizations', {
          ...mutation,
          body: JSON.stringify({ name: 'SMTP smoke organization' }),
        })
        expect(created.status).toBe(201)
        const org = await created.json()
        const accounts = await (
          await request(`/api/organizations/${org.id}/accounts`)
        ).json()
        const body = JSON.stringify({
          date: '2026-10-02',
          description: 'Smoke 180 EUR',
          idempotencyKey: crypto.randomUUID(),
          lines: [
            { accountId: accounts[0].id, side: 'debit', amountCents: 18000 },
            { accountId: accounts[1].id, side: 'credit', amountCents: 18000 },
          ],
        })
        const path = `/api/organizations/${org.id}/journal`
        const first = await request(path, { ...mutation, body })
        expect(first.status).toBe(201)
        expect(
          await (await request(path, { ...mutation, body })).json(),
        ).toEqual(await first.json())
        const history = await (await request(path)).json()
        expect(history).toHaveLength(1)
        expect(
          history[0].lines.map(
            (line: { amountCents: number }) => line.amountCents,
          ),
        ).toEqual([18000, 18000])
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
  },
)
