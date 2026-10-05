import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  prepareDatabase,
  resetDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createFund } from '../src/server/funds'
import { createMovement, changeMovement } from '../src/server/movements'
import { getFundBudget, changeFundBudget } from '../src/server/fund-budgets'

describe.skipIf(!process.env.DATABASE_URL_TEST)('fund budgets', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)

  it('revises and transfers monthly allocations with history, then reflects corrections', async () => {
    const [user] =
      await testSql`insert into users (email) values ('fundbudget@example.test') returning id`
    const org = await createOrganization(user.id, 'Igreja')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    const missions = await createFund({
      organizationId: org.id,
      actorId: user.id,
      name: 'Missões',
    })
    const youth = await createFund({
      organizationId: org.id,
      actorId: user.id,
      name: 'Jovens',
    })
    const identity = { organizationId: org.id, actorId: user.id, year: 2026 }
    await changeFundBudget({
      ...identity,
      operationId: 'missions-10k',
      mode: 'revise',
      reason: 'Plano',
      to: { fundId: missions.id, month: 10 },
      amountCents: 1_000_000,
    })
    await changeFundBudget({
      ...identity,
      operationId: 'youth-5k',
      mode: 'revise',
      reason: 'Plano',
      to: { fundId: youth.id, month: 10 },
      amountCents: 500_000,
    })
    const transferred = await changeFundBudget({
      ...identity,
      operationId: 'transfer-1k',
      mode: 'transfer',
      reason: 'Ajuste',
      from: { fundId: missions.id, month: 10 },
      to: { fundId: youth.id, month: 10 },
      amountCents: 100_000,
    })
    expect(
      await changeFundBudget({
        ...identity,
        operationId: 'transfer-1k',
        mode: 'transfer',
        reason: 'Ajuste',
        from: { fundId: missions.id, month: 10 },
        to: { fundId: youth.id, month: 10 },
        amountCents: 100_000,
      }),
    ).toEqual(transferred)
    const movement = await createMovement({
      ...identity,
      type: 'expense',
      date: '2026-10-05',
      description: 'Material',
      amountCents: 10000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: missions.id,
      idempotencyKey: 'material',
    })
    let budget = await getFundBudget(org.id, user.id, 2026)
    expect(
      budget.cells.find((cell) => cell.fundId === missions.id)?.plannedCents,
    ).toBe(900_000)
    expect(
      budget.cells.find((cell) => cell.fundId === missions.id)?.realizedCents,
    ).toBe('10000')
    expect(budget.events).toHaveLength(3)
    await changeMovement({
      organizationId: org.id,
      actorId: user.id,
      movementId: movement.id,
      idempotencyKey: 'move-fund',
      reason: 'Jovens',
      replacement: {
        ...identity,
        type: 'expense',
        date: '2026-10-05',
        description: 'Material',
        amountCents: 10000,
        financialAccountId: account('BANCO'),
        counterAccountId: account('DESPESA'),
        fundId: youth.id,
      },
    })
    budget = await getFundBudget(org.id, user.id, 2026)
    expect(
      budget.cells.find((cell) => cell.fundId === missions.id)?.realizedCents,
    ).toBe('0')
    expect(
      budget.cells.find((cell) => cell.fundId === youth.id)?.realizedCents,
    ).toBe('10000')
  })

  it('rejects transfer above source allocation', async () => {
    const [user] =
      await testSql`insert into users (email) values ('fundbudget2@example.test') returning id`
    const org = await createOrganization(user.id, 'Igreja')
    const fund = await createFund({
      organizationId: org.id,
      actorId: user.id,
      name: 'Missões',
    })
    await expect(
      changeFundBudget({
        organizationId: org.id,
        actorId: user.id,
        year: 2026,
        operationId: 'too-much',
        mode: 'transfer',
        reason: 'No',
        from: { fundId: fund.id, month: 1 },
        to: { fundId: fund.id, month: 2 },
        amountCents: 100,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
