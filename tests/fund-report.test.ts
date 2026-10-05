import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  prepareDatabase,
  resetDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createFund } from '../src/server/funds'
import { createMovement } from '../src/server/movements'
import { getReports } from '../src/server/reports'
import { exportReport } from '../src/server/report-export'

describe.skipIf(!process.env.DATABASE_URL_TEST)('fund reports', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  it('filters report and export to one fund', async () => {
    const [user] =
      await testSql`insert into users (email) values ('fundreport@example.test') returning id`
    const org = await createOrganization(user.id, 'Report')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    const first = await createFund({
      organizationId: org.id,
      actorId: user.id,
      name: 'Missões',
    })
    const second = await createFund({
      organizationId: org.id,
      actorId: user.id,
      name: 'Jovens',
    })
    for (const [index, fundId] of [first.id, second.id].entries())
      await createMovement({
        organizationId: org.id,
        actorId: user.id,
        type: 'expense',
        date: '2026-10-05',
        description: `Movimento ${index}`,
        amountCents: 10000 * (index + 1),
        financialAccountId: account('BANCO'),
        counterAccountId: account('DESPESA'),
        fundId,
        idempotencyKey: `fund-report-${index}`,
      })
    const filtered = await getReports(
      org.id,
      user.id,
      '2026-10-01',
      '2026-10-31',
      undefined,
      first.id,
    )
    expect(filtered.incomeStatement.expensesCents).toBe('10000')
    const csv = new TextDecoder().decode(
      (
        await exportReport({
          organizationId: org.id,
          actorId: user.id,
          from: '2026-10-01',
          to: '2026-10-31',
          format: 'csv',
          fundId: first.id,
        })
      ).body,
    )
    expect(csv).toContain('Movimento 0')
    expect(csv).not.toContain('Movimento 1')
  })
})
