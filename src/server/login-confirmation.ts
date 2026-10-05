import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

function key() {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new Error('Authentication unavailable')
  return createHash('sha256').update(secret).digest()
}
export function createConfirmationLink(callback: string) {
  const url = new URL(callback)
  if (
    url.pathname !== '/api/auth/callback/nodemailer' ||
    !url.searchParams.has('token') ||
    !url.searchParams.has('email')
  )
    throw new Error('Invalid callback')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({ callback, expires: Date.now() + 24 * 60 * 60 * 1000 }),
    ),
    cipher.final(),
  ])
  const challenge = Buffer.concat([
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]).toString('base64url')
  const destination = new URL('/auth/confirm', url.origin)
  destination.searchParams.set('c', challenge)
  return destination.toString()
}
export function resolveConfirmationChallenge(
  challenge: string,
  origin: string,
) {
  if (!/^[A-Za-z0-9_-]{40,4096}$/.test(challenge))
    throw new Error('Invalid confirmation')
  const bytes = Buffer.from(challenge, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  const decoded = JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString('utf8'),
  ) as { callback: string; expires: number }
  const target = new URL(decoded.callback)
  if (
    target.origin !== origin ||
    target.pathname !== '/api/auth/callback/nodemailer' ||
    !target.searchParams.has('token') ||
    !target.searchParams.has('email') ||
    decoded.expires < Date.now()
  )
    throw new Error('Invalid confirmation')
  return target.toString()
}
