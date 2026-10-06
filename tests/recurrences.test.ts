import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  prepareDatabase,
  resetDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { listJournal } from '../src/server/journal'
import { listMovements } from '../src/server/movements'
import {
  createRecurrence,
  confirmOccurrence,
  generateDueDates,
  listDueOccurrences,
  updateRecurrence,
  skipOccurrence,
} from '../src/server/recurrences'

describe('recurrence dates', () => {
  it('anchors day 31 to shorter months without timezone drift', () => {
    expect(
      generateDueDates(
        {
          frequency: 'monthly',
          startDate: '2027-01-31',
          endDate: null,
          anchorDay: 31,
        },
        '2027-01-01',
        '2027-04-30',
      ),
    ).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
    expect(
      generateDueDates(
        {
          frequency: 'weekly',
          startDate: '2027-03-21',
          endDate: null,
          anchorDay: 21,
        },
        '2027-03-21',
        '2027-04-04',
      ),
    ).toEqual(['2027-03-21', '2027-03-28', '2027-04-04'])
  })
})

describe.skipIf(!process.env.DATABASE_URL_TEST)('recurring proposals', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  it('confirms once under concurrent requests and posts one balanced movement', async () => {
    const [user] =
      await testSql`insert into users (email) values ('recurrence@example.test') returning id`
    const org = await createOrganization(user.id, 'Recurring')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    const rule = await createRecurrence({
      organizationId: org.id,
      actorId: user.id,
      type: 'expense',
      frequency: 'monthly',
      startDate: '2026-01-31',
      endDate: null,
      description: 'Renda',
      amountCents: 10000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: null,
    })
    const identity = {
      organizationId: org.id,
      actorId: user.id,
      ruleId: rule.id,
      dueDate: '2026-02-28',
    }
    const result = await Promise.all([
      confirmOccurrence(identity),
      confirmOccurrence(identity),
    ])
    expect(result[0]).toEqual(result[1])
    expect(await listMovements(org.id, user.id)).toHaveLength(1)
    expect((await listJournal(org.id, user.id))[0].lines).toHaveLength(2)
    expect(
      (
        await listDueOccurrences(org.id, user.id, '2026-02-28', '2026-02-01')
      ).find((item) => item.dueDate === '2026-02-28'),
    ).toBeUndefined()
  })
  it('edits future proposals without changing confirmed movements', async () => {
    const [user] =
      await testSql`insert into users (email) values ('recurrence-edit@example.test') returning id`
    const org = await createOrganization(user.id, 'Recurring')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    const template = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate: '2026-01-15',
      endDate: null,
      description: 'Renda',
      amountCents: 1000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: null,
    }
    const rule = await createRecurrence(template)
    await confirmOccurrence({
      organizationId: org.id,
      actorId: user.id,
      ruleId: rule.id,
      dueDate: '2026-01-15',
    })
    const revised = await updateRecurrence({
      ...template,
      ruleId: rule.id,
      amountCents: 2000,
      active: true,
    }, '2026-01-20')
    await confirmOccurrence({
      organizationId: org.id,
      actorId: user.id,
      ruleId: revised.id,
      dueDate: '2026-02-15',
    })
    expect(
      (await listMovements(org.id, user.id))
        .map((movement) => movement.amountCents)
        .sort(),
    ).toEqual([1000, 2000])
  })
  it('keeps postponed occurrences visible after the original date leaves the window', async () => {
    const [user] =
      await testSql`insert into users (email) values ('recurrence-postpone@example.test') returning id`
    const org = await createOrganization(user.id, 'Recurring')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    const rule = await createRecurrence({
      organizationId: org.id,
      actorId: user.id,
      type: 'expense',
      frequency: 'monthly',
      startDate: '2026-01-15',
      endDate: null,
      description: 'Renda',
      amountCents: 1000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: null,
    })
    await skipOccurrence({
      organizationId: org.id,
      actorId: user.id,
      ruleId: rule.id,
      dueDate: '2026-01-15',
      postponedUntil: '2026-02-10',
    })
    expect(
      (
        await listDueOccurrences(org.id, user.id, '2026-02-10', '2026-02-01')
      ).find((item) => item.dueDate === '2026-01-15')?.effectiveDate,
    ).toBe('2026-02-10')
  })
  it('preserves overdue and postponed proposals when a rule changes', async () => {
    const [user] = await testSql`insert into users (email) values ('recurrence-version@example.test') returning id`
    const org = await createOrganization(user.id, 'Recurring')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) => accounts.find((row) => row.code === code)!.id
    const template = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate: '2026-01-31',
      endDate: null,
      description: 'Renda',
      amountCents: 1000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: null,
    }
    const original = await createRecurrence(template)
    await skipOccurrence({
      organizationId: org.id,
      actorId: user.id,
      ruleId: original.id,
      dueDate: '2026-01-31',
      postponedUntil: '2026-03-05',
    })
    const revised = await updateRecurrence({
      ...template,
      ruleId: original.id,
      startDate: '2026-02-01',
      amountCents: 2000,
      active: true,
    }, '2026-02-01')
    expect(revised.id).not.toBe(original.id)
    const proposals = await listDueOccurrences(org.id, user.id, '2026-03-05', '2026-03-01')
    expect(proposals.find((item) => item.ruleId === original.id)).toMatchObject({
      dueDate: '2026-01-31',
      effectiveDate: '2026-03-05',
      amountCents: 1000,
    })
    await confirmOccurrence({
      organizationId: org.id,
      actorId: user.id,
      ruleId: original.id,
      dueDate: '2026-01-31',
    })
    expect((await listMovements(org.id, user.id))[0].amountCents).toBe(1000)
  })
})
