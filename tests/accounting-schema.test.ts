import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prepareDatabase, closeDatabase, testSql } from './helpers/database'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'PostgreSQL accounting integrity',
  () => {
    beforeAll(prepareDatabase)
    afterAll(closeDatabase)
    it('rejects a journal line referencing an account in another organization', async () => {
      const [a] =
        await testSql`insert into organizations (name) values ('A') returning id`
      const [b] =
        await testSql`insert into organizations (name) values ('B') returning id`
      const [user] =
        await testSql`insert into users (email) values ('schema@example.test') returning id`
      const [account] =
        await testSql`insert into accounts (organization_id, code, name) values (${b.id}, '11', 'Cash') returning id`
      const [entry] =
        await testSql`insert into journal_entries (organization_id, actor_id, date, description, idempotency_key, request_hash) values (${a.id}, ${user.id}, '2026-10-02', 'Test', 'schema-test', 'hash') returning id`
      await expect(
        testSql`insert into journal_lines (organization_id, entry_id, account_id, side, amount_cents) values (${a.id}, ${entry.id}, ${account.id}, 'debit', 18000)`,
      ).rejects.toMatchObject({ code: '23503' })
    })
  },
)
