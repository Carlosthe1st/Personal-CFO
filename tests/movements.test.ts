import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createMovement, listMovements } from '../src/server/movements'
import { listJournal } from '../src/server/journal'
import { NextRequest } from 'next/server'
import {
  GET,
  POST,
} from '../src/app/api/organizations/[organizationId]/movements/route'

describe.skipIf(!process.env.DATABASE_URL_TEST)('simple movements', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  async function setup() {
    const [user] =
      await testSql`insert into users (email) values ('editor@example.test') returning id`
    const org = await createOrganization(user.id, 'Test')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((item) => item.code === code)!.id
    return { user, org, account }
  }
  it('records a 180 EUR expense and its balanced journal once', async () => {
    const { user, org, account } = await setup()
    const input = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      date: '2026-10-03',
      description: 'Fuel',
      amountCents: 18000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      idempotencyKey: 'expense-180',
    }
    const result = await createMovement(input)
    expect(await listMovements(org.id, user.id)).toEqual([
      expect.objectContaining({
        ...input,
        id: result.id,
        journalEntryId: result.journalEntryId,
      }),
    ])
    const journal = await listJournal(org.id, user.id)
    expect(journal).toHaveLength(1)
    expect(journal[0].lines).toEqual(
      expect.arrayContaining([
        { accountId: account('DESPESA'), side: 'debit', amountCents: 18000 },
        { accountId: account('BANCO'), side: 'credit', amountCents: 18000 },
      ]),
    )
  })
  it('rejects a non-financial source or non-financial transfer destination without writing', async () => {
    const { user, org, account } = await setup()
    const input = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      date: '2026-10-03',
      description: 'Invalid source',
      amountCents: 18000,
      financialAccountId: account('RENDIMENTO'),
      counterAccountId: account('DESPESA'),
      idempotencyKey: 'invalid-source',
    }
    await expect(createMovement(input)).rejects.toMatchObject({ status: 400 })
    await expect(
      createMovement({
        ...input,
        type: 'transfer',
        financialAccountId: account('BANCO'),
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(await listJournal(org.id, user.id)).toEqual([])
    expect(await listMovements(org.id, user.id)).toEqual([])
  })
  it('takes identity from the session and exposes only authorized movements', async () => {
    const { user, org, account } = await setup()
    await testSql`insert into sessions (session_token,user_id,expires) values ('movement-session',${user.id},now()+interval '1 hour')`
    const request = (body?: unknown, cookie = 'movement-session') =>
      new NextRequest(
        `http://localhost/api/organizations/${org.id}/movements`,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            host: 'localhost',
            'x-forwarded-proto': 'http',
            origin: 'http://localhost',
            'content-type': 'application/json',
            cookie: `authjs.session-token=${cookie}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
    const context = { params: Promise.resolve({ organizationId: org.id }) }
    const response = await POST(
      request({
        actorId: 'forged',
        organizationId: 'forged',
        type: 'income',
        date: '2026-10-03',
        description: 'Payment',
        amountCents: 50000,
        financialAccountId: account('BANCO'),
        counterAccountId: account('RENDIMENTO'),
        idempotencyKey: 'api-income',
      }),
      context,
    )
    expect(response.status).toBe(201)
    const [incomeJournal] = await listJournal(org.id, user.id)
    expect(incomeJournal.lines).toEqual(
      expect.arrayContaining([
        { accountId: account('BANCO'), side: 'debit', amountCents: 50000 },
        {
          accountId: account('RENDIMENTO'),
          side: 'credit',
          amountCents: 50000,
        },
      ]),
    )
    const history = await GET(request(), context)
    expect(history.status).toBe(200)
    expect(await history.json()).toEqual([
      expect.objectContaining({
        actorId: user.id,
        organizationId: org.id,
        amountCents: 50000,
      }),
    ])
    expect((await GET(request(undefined, ''), context)).status).toBe(401)
    expect(
      (
        await GET(request(), {
          params: Promise.resolve({ organizationId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(403)
  })
  it('transfers between bank and cash without posting income or expense', async () => {
    const { user, org, account } = await setup()
    await createMovement({
      organizationId: org.id,
      actorId: user.id,
      type: 'transfer',
      date: '2026-10-03',
      description: 'Withdraw',
      amountCents: 20000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('CAIXA'),
      idempotencyKey: 'transfer',
    })
    const [entry] = await listJournal(org.id, user.id)
    expect(entry.lines).toEqual(
      expect.arrayContaining([
        { accountId: account('CAIXA'), side: 'debit', amountCents: 20000 },
        { accountId: account('BANCO'), side: 'credit', amountCents: 20000 },
      ]),
    )
    expect(entry.lines).toHaveLength(2)
  })
  it('replays a concurrent operation once and rejects a changed payload', async () => {
    const { user, org, account } = await setup()
    const input = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      date: '2026-10-03',
      description: 'Fuel',
      amountCents: 18000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      idempotencyKey: 'repeat',
    }
    const results = await Promise.all([
      createMovement(input),
      createMovement(input),
    ])
    expect(results[0]).toEqual(results[1])
    await expect(
      createMovement({ ...input, amountCents: 15000 }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await listMovements(org.id, user.id)).toHaveLength(1)
    const journal = await listJournal(org.id, user.id)
    expect(journal).toHaveLength(1)
    expect(journal[0].events).toEqual([{ action: 'journal.posted' }])
  })
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid cents %s without writes',
    async (amountCents) => {
      const { user, org, account } = await setup()
      await expect(
        createMovement({
          organizationId: org.id,
          actorId: user.id,
          type: 'expense',
          date: '2026-10-03',
          description: 'Invalid',
          amountCents,
          financialAccountId: account('BANCO'),
          counterAccountId: account('DESPESA'),
          idempotencyKey: 'invalid',
        }),
      ).rejects.toMatchObject({ status: 400 })
      expect(await listJournal(org.id, user.id)).toEqual([])
      expect(await listMovements(org.id, user.id)).toEqual([])
    },
  )
  it('rolls back journal and audit if storing the movement fails', async () => {
    const { user, org, account } = await setup()
    await testSql`alter table movements add constraint test_reject_movement check (description <> 'Reject movement')`
    try {
      await expect(
        createMovement({
          organizationId: org.id,
          actorId: user.id,
          type: 'expense',
          date: '2026-10-03',
          description: 'Reject movement',
          amountCents: 18000,
          financialAccountId: account('BANCO'),
          counterAccountId: account('DESPESA'),
          idempotencyKey: 'rollback',
        }),
      ).rejects.toThrow()
      expect(await listJournal(org.id, user.id)).toEqual([])
      expect(await listMovements(org.id, user.id)).toEqual([])
      expect(
        await testSql`select count(*)::integer as count from audit_events`,
      ).toEqual([{ count: 0 }])
    } finally {
      await testSql`alter table movements drop constraint test_reject_movement`
    }
  })
  it('denies readers, foreign and inactive accounts', async () => {
    const { user, org, account } = await setup()
    const other = await createOrganization(user.id, 'Other')
    const [foreign] = await listAccounts(other.id, user.id)
    const input = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      date: '2026-10-03',
      description: 'Invalid',
      amountCents: 18000,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      idempotencyKey: 'denied',
    }
    await expect(
      createMovement({ ...input, counterAccountId: foreign.id }),
    ).rejects.toMatchObject({ status: 403 })
    await testSql`update accounts set active=false where id=${account('DESPESA')}`
    await expect(createMovement(input)).rejects.toMatchObject({ status: 403 })
    await testSql`update memberships set role='reader' where organization_id=${org.id}`
    await expect(createMovement(input)).rejects.toMatchObject({ status: 403 })
    expect(await listMovements(org.id, user.id)).toEqual([])
  })
})
