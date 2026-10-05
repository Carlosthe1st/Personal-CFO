import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  prepareDatabase,
  resetDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createFund, listFunds, updateFund } from '../src/server/funds'
import {
  changeMovement,
  createMovement,
  listMovements,
} from '../src/server/movements'

describe.skipIf(!process.env.DATABASE_URL_TEST)('organization funds', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)

  it('classifies movements without changing the journal and moves realized use on correction', async () => {
    const [user] =
      await testSql`insert into users (email) values ('fund@example.test') returning id`
    const org = await createOrganization(user.id, 'Igreja')
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
    expect(await listFunds(org.id, user.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.id })]),
    )
    const input = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      date: '2026-10-05',
      description: 'Material',
      amountCents: 10000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      fundId: first.id,
    }
    const movement = await createMovement({
      ...input,
      idempotencyKey: 'fund-first',
    })
    await changeMovement({
      organizationId: org.id,
      actorId: user.id,
      movementId: movement.id,
      idempotencyKey: 'fund-correction',
      reason: 'Outra equipa',
      replacement: { ...input, fundId: second.id },
    })
    const rows = await listMovements(org.id, user.id)
    expect(rows.map((row) => [row.fundId, row.status])).toEqual(
      expect.arrayContaining([
        [first.id, 'corrected'],
        [second.id, 'active'],
      ]),
    )
    await updateFund({
      organizationId: org.id,
      actorId: user.id,
      fundId: first.id,
      name: 'Missões internacionais',
      active: false,
    })
    await expect(
      createMovement({ ...input, idempotencyKey: 'archived' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a fund from another organization', async () => {
    const [user] =
      await testSql`insert into users (email) values ('fund-other@example.test') returning id`
    const org = await createOrganization(user.id, 'A')
    const other = await createOrganization(user.id, 'B')
    const accounts = await listAccounts(other.id, user.id)
    const account = (code: string) =>
      accounts.find((row) => row.code === code)!.id
    const fund = await createFund({
      organizationId: org.id,
      actorId: user.id,
      name: 'Apenas A',
    })
    await expect(
      createMovement({
        organizationId: other.id,
        actorId: user.id,
        type: 'expense',
        date: '2026-10-05',
        description: 'No',
        amountCents: 100,
        financialAccountId: account('BANCO'),
        counterAccountId: account('DESPESA'),
        fundId: fund.id,
        idempotencyKey: 'wrong-fund',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
