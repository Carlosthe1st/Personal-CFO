import 'server-only'
import NextAuth from 'next-auth'
import Nodemailer from 'next-auth/providers/nodemailer'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb } from './db/client'
import { users, authAccounts, sessions, verificationTokens } from './db/schema'

export function authConfigured() {
  return !!(
    process.env.DATABASE_URL &&
    process.env.AUTH_SECRET &&
    process.env.AUTH_SECRET.length >= 32 &&
    process.env.EMAIL_SERVER &&
    process.env.EMAIL_FROM
  )
}
export const { auth, handlers, signIn, signOut } = NextAuth(() => {
  if (!authConfigured()) throw new Error('Authentication unavailable')
  return {
    secret: process.env.AUTH_SECRET,
    trustHost: process.env.AUTH_TRUST_HOST === 'true',
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: authAccounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: 'database' },
    providers: [
      Nodemailer({
        server: process.env.EMAIL_SERVER!,
        from: process.env.EMAIL_FROM!,
        normalizeIdentifier(identifier) {
          const email = identifier.trim().toLowerCase()
          if (
            email.length > 254 ||
            !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(
              email,
            )
          )
            throw new Error('Invalid email')
          return email
        },
      }),
    ],
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id
        return session
      },
    },
  }
})
