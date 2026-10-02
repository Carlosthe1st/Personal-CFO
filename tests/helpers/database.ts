import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { vi } from 'vitest'

const url = process.env.DATABASE_URL_TEST
if (url) {
  const parsed = new URL(url)
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw new Error(
      'DATABASE_URL_TEST must name a disposable local *_test database',
    )
}
export const testSql = postgres(
  url ?? 'postgres://invalid@127.0.0.1:1/unconfigured_test',
  { max: 1, onnotice: () => {} },
)
export async function prepareDatabase() {
  if (!url)
    throw new Error('DATABASE_URL_TEST is required for PostgreSQL integration')
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('AUTH_SECRET', 'local-test-secret-at-least-32-characters')
  vi.stubEnv('EMAIL_SERVER', 'smtp://127.0.0.1:25252')
  vi.stubEnv('EMAIL_FROM', 'login@example.test')
  vi.stubEnv('AUTH_TRUST_HOST', 'true')
  await migrate(drizzle(testSql), { migrationsFolder: './drizzle' })
  await resetDatabase()
}
export async function resetDatabase() {
  await testSql`truncate organizations, users cascade`
}
export async function closeDatabase() {
  await testSql.end()
  vi.unstubAllEnvs()
}
