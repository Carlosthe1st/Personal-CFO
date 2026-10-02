import { describe, expect, it } from 'vitest'

describe.skipIf(!process.env.ACCOUNTING_TEST_BASE_URL)(
  'production accounting access',
  () => {
    it('redirects an anonymous visitor and denies the organization API', async () => {
      const base = process.env.ACCOUNTING_TEST_BASE_URL!
      if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
        throw new Error('Smoke tests require a disposable loopback server')
      const page = await fetch(`${base}/contabilidade`, { redirect: 'manual' })
      expect(page.status).toBe(307)
      expect(page.headers.get('location')).toBe(
        '/api/auth/signin?callbackUrl=/contabilidade',
      )
      expect((await fetch(`${base}/api/organizations`)).status).toBe(401)
    })
  },
)
