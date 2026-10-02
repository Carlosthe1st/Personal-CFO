import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

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
  { max: 1 },
)
export async function prepareDatabase() {
  if (!url)
    throw new Error('DATABASE_URL_TEST is required for PostgreSQL integration')
  await migrate(drizzle(testSql), { migrationsFolder: './drizzle' })
  await resetDatabase()
}
export async function resetDatabase() {
  await testSql`truncate organizations, users cascade`
}
export async function closeDatabase() {
  await testSql.end()
}
