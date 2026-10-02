import 'server-only'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

let database: ReturnType<typeof createDatabase> | undefined
function createDatabase(url: string) {
  const parsed = new URL(url)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
    parsed.searchParams.get('sslmode') !== 'verify-full'
  )
    throw new Error('Verified TLS required')
  return drizzle(
    new Pool({
      connectionString: url,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    }),
    { schema },
  )
}
export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Database unavailable')
  database ??= createDatabase(url)
  return database
}
