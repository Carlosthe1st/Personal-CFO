import { afterEach, expect, it, vi } from 'vitest'
import {
  createConfirmationLink,
  resolveConfirmationChallenge,
} from '../src/server/login-confirmation'

afterEach(() => vi.unstubAllEnvs())
it('defers a magic-link callback until the user confirms, rejecting tampering', () => {
  vi.stubEnv('AUTH_SECRET', 'local-test-secret-at-least-32-characters')
  const callback =
    'https://personalcfo.online/api/auth/callback/nodemailer?token=secret&email=a%40example.test'
  const confirmation = new URL(createConfirmationLink(callback))
  expect(confirmation.pathname).toBe('/auth/confirm')
  expect(confirmation.toString()).not.toContain('secret')
  expect(
    resolveConfirmationChallenge(
      confirmation.searchParams.get('c')!,
      confirmation.origin,
    ),
  ).toBe(callback)
  expect(() =>
    resolveConfirmationChallenge(
      `${confirmation.searchParams.get('c')}x`,
      confirmation.origin,
    ),
  ).toThrow()
})
