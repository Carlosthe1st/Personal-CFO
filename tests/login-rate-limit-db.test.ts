import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, prepareDatabase, testSql } from './helpers/database'
import { consumeLoginAttempt } from '../src/server/login-rate-limit'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'persistent email login limit',
  () => {
    beforeAll(prepareDatabase)
    beforeEach(async () => {
      await testSql`delete from login_rate_limits`
    })
    afterAll(closeDatabase)

    it('counts concurrent requests atomically and resets an expired window', async () => {
      const counts = await Promise.all(
        Array.from({ length: 4 }, () => consumeLoginAttempt('test-hash')),
      )
      expect(counts.sort()).toEqual([1, 2, 3, 4])
      await testSql`update login_rate_limits set window_start = now() - interval '16 minutes' where key_hash = 'test-hash'`
      expect(await consumeLoginAttempt('test-hash')).toBe(1)
    })

    it('removes expired tracking rows in bounded batches', async () => {
      await testSql`
        insert into login_rate_limits (key_hash, window_start, attempts)
        select 'expired-' || value, now() - interval '2 days', 1
        from generate_series(1, 120) as value
      `
      expect(await consumeLoginAttempt('active-key')).toBe(1)
      const [remaining] = await testSql`
        select count(*)::int as count from login_rate_limits
        where window_start < now() - interval '1 day'
      `
      expect(remaining.count).toBe(20)
    })
  },
)
