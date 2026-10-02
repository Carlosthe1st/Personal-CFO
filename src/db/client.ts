import 'server-only'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

let database: ReturnType<typeof createDatabase> | undefined
function createDatabase(url: string) {
  return drizzle(
    postgres(url, { max: 5, idle_timeout: 10, connect_timeout: 5 }),
    { schema },
  )
}
export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Database unavailable')
  database ??= createDatabase(url)
  return database
}
