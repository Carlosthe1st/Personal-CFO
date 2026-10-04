import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { postJournal } from '../src/server/journal'
import { getReports } from '../src/server/reports'

describe.skipIf(!process.env.DATABASE_URL_TEST)('financial reports', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  it('derives opening balances, trial balance, balance sheet and result from posted entries', async () => {
    const [actor] =
      await testSql`insert into users (email) values ('reports@example.test') returning id`
    const org = await createOrganization(actor.id, 'Reports')
    const accounts = await listAccounts(org.id, actor.id)
    const id = (code: string) =>
      accounts.find((account) => account.code === code)!.id
    for (const [date, debit, credit, amount] of [
      ['2026-09-30', 'BANCO', 'ABERTURA', 100000],
      ['2026-10-01', 'DESPESA', 'BANCO', 18000],
      ['2026-10-02', 'BANCO', 'RENDIMENTO', 50000],
    ] as const)
      await postJournal({
        organizationId: org.id,
        actorId: actor.id,
        date,
        description: debit,
        idempotencyKey: date,
        lines: [
          { accountId: id(debit), side: 'debit', amountCents: amount },
          { accountId: id(credit), side: 'credit', amountCents: amount },
        ],
      })
    const report = await getReports(
      org.id,
      actor.id,
      '2026-10-01',
      '2026-10-31',
    )
    expect(report).toMatchObject({
      trialBalance: { debitCents: '68000', creditCents: '68000' },
      balanceSheet: {
        assetsCents: '132000',
        liabilitiesCents: '0',
        equityCents: '100000',
        retainedResultCents: '32000',
        differenceCents: '0',
      },
      incomeStatement: {
        incomeCents: '50000',
        expensesCents: '18000',
        resultCents: '32000',
      },
    })
    expect(
      report.accounts.find((account) => account.code === 'BANCO'),
    ).toMatchObject({ openingCents: '100000', balanceCents: '132000' })
    expect(report.ledger).toHaveLength(4)
    const [other] =
      await testSql`insert into users (email) values ('outsider@example.test') returning id`
    await expect(
      getReports(org.id, other.id, '2026-10-01', '2026-10-31'),
    ).rejects.toThrow()
    await expect(
      getReports(org.id, actor.id, '2026-02-31', '2026-10-31'),
    ).rejects.toThrow()
  })
})
