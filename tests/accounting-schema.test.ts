import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prepareDatabase, closeDatabase, testSql } from './helpers/database'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'PostgreSQL accounting integrity',
  () => {
    beforeAll(prepareDatabase)
    afterAll(closeDatabase)
    it('enables row-level security on every accounting table', async () => {
      const rows = await testSql`
        select c.relname, c.relrowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('users', 'auth_accounts', 'sessions', 'verification_tokens', 'organizations', 'memberships', 'accounts', 'journal_entries', 'journal_lines', 'audit_events', 'login_rate_limits', 'movements')
      `
      expect(rows).toHaveLength(12)
      expect(rows.every((row) => row.relrowsecurity)).toBe(true)
    })
    it('does not grant Data API roles access to movements', async () => {
      const rows = await testSql`
        select a.privilege_type
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        left join pg_roles r on r.oid = a.grantee
        where c.oid = 'public.movements'::regclass
          and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
      `
      expect(rows).toHaveLength(0)
    })
    it('pins the search path of journal trigger functions', async () => {
      const rows = await testSql`
        select p.proname, p.proconfig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('protect_journal_entry', 'protect_journal_line')
      `
      expect(rows).toHaveLength(2)
      expect(
        rows.every((row) =>
          row.proconfig?.includes('search_path=pg_catalog, public, pg_temp'),
        ),
      ).toBe(true)
    })
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
