import { describe, expect, it } from 'vitest'
import { guardLoginRequest } from '../src/server/login-rate-limit'

describe('email login rate limit', () => {
  it('rejects a fourth request for the same email without sending another link', async () => {
    const attempts = new Map<string, number>()
    const consume = async (key: string) => {
      const count = (attempts.get(key) ?? 0) + 1
      attempts.set(key, count)
      return count
    }
    const request = new Request(
      'https://personalcfo.online/api/auth/signin/nodemailer',
      {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
      },
    )

    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        await guardLoginRequest(
          request,
          'email=alice%40example.com',
          consume,
          'test-secret',
        ),
      ).toBeNull()
    }
    const blocked = await guardLoginRequest(
      request,
      'email=ALICE%40example.com',
      consume,
      'test-secret',
    )
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('retry-after')).toBe('900')
  })

  it('limits a source IP even when it changes email addresses', async () => {
    const attempts = new Map<string, number>()
    const consume = async (key: string) => {
      const count = (attempts.get(key) ?? 0) + 1
      attempts.set(key, count)
      return count
    }
    const request = new Request(
      'https://personalcfo.online/api/auth/signin/nodemailer',
      {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': '203.0.113.11' },
      },
    )

    for (let attempt = 0; attempt < 10; attempt++) {
      expect(
        await guardLoginRequest(
          request,
          `email=user${attempt}%40example.com`,
          consume,
          'test-secret',
        ),
      ).toBeNull()
    }
    expect(
      (
        await guardLoginRequest(
          request,
          'email=next%40example.com',
          consume,
          'test-secret',
        )
      )?.status,
    ).toBe(429)
  })
})
