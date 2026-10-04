import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createAccount, updateAccount } from '../src/server/accounts'

describe.skipIf(!process.env.DATABASE_URL_TEST)('account management', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  async function setup() {
    const [user] =
      await testSql`insert into users (email) values ('accounts@example.test') returning id`
    const organization = await createOrganization(user.id, 'Account test')
    return { actorId: user.id as string, organizationId: organization.id }
  }
  it('creates classified categories and records edits without losing history', async () => {
    const identity = await setup()
    const account = await createAccount({
      ...identity,
      code: 'RENT',
      name: 'Renda',
      kind: 'expense',
    })
    const edited = await updateAccount({
      ...identity,
      accountId: account.id,
      expectedVersion: 0,
      code: 'RENT',
      name: 'Renda mensal',
      kind: 'expense',
      active: false,
    })
    expect(edited).toMatchObject({
      name: 'Renda mensal',
      active: false,
      version: 1,
    })
    await expect(
      updateAccount({
        ...identity,
        accountId: account.id,
        expectedVersion: 0,
        code: 'RENT',
        name: 'Stale',
        kind: 'expense',
        active: true,
      }),
    ).rejects.toThrow()
    const events =
      await testSql`select action, data from audit_events where organization_id=${identity.organizationId} order by created_at`
    expect(events.map((event) => event.action)).toEqual([
      'account.created',
      'account.updated',
    ])
    expect(events[1].data).toMatchObject({
      before: { name: 'Renda' },
      after: { name: 'Renda mensal' },
    })
  })
  it('supports balance sheet classes and forbids another organization or reader from editing', async () => {
    const identity = await setup()
    const opening = (
      await listAccounts(identity.organizationId, identity.actorId)
    ).find((account) => account.code === 'ABERTURA')
    expect(opening?.kind).toBe('equity')
    const account = await createAccount({
      ...identity,
      code: 'LOAN',
      name: 'Empréstimo',
      kind: 'liability',
    })
    const other = await createOrganization(identity.actorId, 'Other')
    await expect(
      updateAccount({
        ...identity,
        organizationId: other.id,
        accountId: account.id,
        expectedVersion: 0,
        code: 'LOAN',
        name: 'No',
        kind: 'liability',
        active: true,
      }),
    ).rejects.toThrow()
    await testSql`update memberships set role='reader' where organization_id=${identity.organizationId}`
    await expect(
      createAccount({ ...identity, code: 'NO', name: 'No', kind: 'expense' }),
    ).rejects.toThrow()
  })
})
