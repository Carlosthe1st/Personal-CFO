import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { getDb } from '../src/db/client'
import { closeDatabase, prepareDatabase } from './helpers/database'

describe.skipIf(!process.env.DATABASE_URL_TEST)('database connection', () => {
  beforeAll(prepareDatabase)
  afterAll(closeDatabase)

  it('does not create session prepared statements', async () => {
    const result = await getDb().execute(sql`
      select count(*)::int as count from pg_prepared_statements
    `)
    expect(result.rows[0].count).toBe(0)
  })
})
