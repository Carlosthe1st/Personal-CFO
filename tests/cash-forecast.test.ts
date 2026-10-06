import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  prepareDatabase,
  resetDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { postJournal } from '../src/server/journal'
import { createRecurrence, confirmOccurrence } from '../src/server/recurrences'
import { getCashForecast } from '../src/server/cash-forecast'

describe.skipIf(!process.env.DATABASE_URL_TEST)('cash forecast', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  it('separates confirmed cash from the next 90 days without double counting confirmation', async () => {
    const [user] =
      await testSql`insert into users (email) values ('forecast@example.test') returning id`
    const org = await createOrganization(user.id, 'Forecast')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    await postJournal({
      organizationId: org.id,
      actorId: user.id,
      date: '2026-10-06',
      description: 'Saldo inicial',
      idempotencyKey: 'opening-forecast',
      lines: [
        { accountId: account('BANCO'), side: 'debit', amountCents: 100000 },
        {
          accountId: account('RENDIMENTO'),
          side: 'credit',
          amountCents: 100000,
        },
      ],
    })
    const rule = await createRecurrence({
      organizationId: org.id,
      actorId: user.id,
      type: 'expense',
      frequency: 'monthly',
      startDate: '2026-10-20',
      endDate: '2026-10-20',
      description: 'Conta',
      amountCents: 10000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: null,
    })
    let forecast = await getCashForecast(org.id, user.id, '2026-10-06')
    expect(forecast.actualCents).toBe('100000')
    expect(
      forecast.points.find((point) => point.date === '2026-10-20')
        ?.projectedCents,
    ).toBe('90000')
    await confirmOccurrence({
      organizationId: org.id,
      actorId: user.id,
      ruleId: rule.id,
      dueDate: '2026-10-20',
    })
    forecast = await getCashForecast(org.id, user.id, '2026-10-06')
    expect(forecast.actualCents).toBe('100000')
    expect(
      forecast.points.find((point) => point.date === '2026-10-20')
        ?.projectedCents,
    ).toBe('90000')
  })
})
