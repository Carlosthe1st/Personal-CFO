import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { getBudget, reviseBudget, transferBudget } from '../src/server/budgets'
import { createMovement } from '../src/server/movements'
import { postJournal } from '../src/server/journal'
import { NextRequest } from 'next/server'
import {
  GET,
  POST,
} from '../src/app/api/organizations/[organizationId]/budgets/[year]/route'

describe.skipIf(!process.env.DATABASE_URL_TEST)('annual budgets', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  async function setup() {
    const [user] =
      await testSql`insert into users (email) values ('budget@example.test') returning id`
    const org = await createOrganization(user.id, 'Budget test')
    const accounts = await listAccounts(org.id, user.id)
    const expenseId = accounts.find((a) => a.code === 'DESPESA')!.id
    return {
      organizationId: org.id,
      actorId: user.id,
      year: 2026,
      expectedVersion: 0,
      idempotencyKey: 'initial',
      expenseId,
    }
  }
  it('sets a 70000 EUR annual budget with a monthly category allocation and revision history', async () => {
    const input = await setup()
    expect(
      await reviseBudget({
        ...input,
        annualCents: 7000000,
        cells: [{ month: 10, accountId: input.expenseId, plannedCents: 10000 }],
      }),
    ).toEqual({ version: 1 })
    const budget = await getBudget(input.organizationId, input.actorId, 2026)
    expect(budget).toMatchObject({
      annualCents: 7000000,
      plannedCents: '10000',
      undistributedCents: '6990000',
      version: 1,
    })
    expect(budget.history).toEqual([
      expect.objectContaining({
        actorId: input.actorId,
        action: 'revise',
        version: 1,
        data: expect.objectContaining({
          before: expect.objectContaining({ annualCents: 0 }),
          after: expect.objectContaining({ annualCents: 7000000 }),
        }),
      }),
    ])
  })
  it('reports posted expense, deficit and reversal from the ledger without blocking spending', async () => {
    const input = await setup()
    const bank = (await listAccounts(input.organizationId, input.actorId)).find(
      (a) => a.code === 'BANCO',
    )!.id
    await reviseBudget({
      ...input,
      annualCents: 10000,
      cells: [{ month: 10, accountId: input.expenseId, plannedCents: 10000 }],
    })
    await createMovement({
      ...input,
      type: 'expense',
      date: '2026-10-04',
      description: 'Fuel',
      amountCents: 18000,
      financialAccountId: bank,
      counterAccountId: input.expenseId,
      idempotencyKey: 'spend',
    })
    const budget = await getBudget(input.organizationId, input.actorId, 2026)
    expect(budget).toMatchObject({
      realizedCents: '18000',
      availableCents: '-8000',
      warnings: ['deficit'],
    })
    expect(budget.cells).toEqual([
      expect.objectContaining({
        month: 10,
        accountId: input.expenseId,
        plannedCents: 10000,
        realizedCents: '18000',
        availableCents: '-8000',
      }),
    ])
    await postJournal({
      ...input,
      date: '2026-10-04',
      description: 'Reversal',
      idempotencyKey: 'reverse',
      lines: [
        { accountId: input.expenseId, side: 'credit', amountCents: 18000 },
        { accountId: bank, side: 'debit', amountCents: 18000 },
      ],
    })
    expect(
      await getBudget(input.organizationId, input.actorId, 2026),
    ).toMatchObject({
      realizedCents: '0',
      availableCents: '10000',
      warnings: [],
    })
  })
  it('maps spending to fiscal months when the exercise starts in April', async () => {
    const input = await setup()
    await testSql`update organizations set fiscal_year_start_month = 4 where id = ${input.organizationId}`
    await reviseBudget({
      ...input,
      annualCents: 30000,
      cells: [
        { month: 1, accountId: input.expenseId, plannedCents: 10000 },
        { month: 10, accountId: input.expenseId, plannedCents: 20000 },
      ],
    })
    const bank = (await listAccounts(input.organizationId, input.actorId)).find(
      (account) => account.code === 'BANCO',
    )!.id
    for (const [date, amountCents] of [
      ['2026-04-04', 18000],
      ['2027-01-04', 5000],
    ] as const)
      await createMovement({
        ...input,
        type: 'expense',
        date,
        description: 'Fiscal spend',
        amountCents,
        financialAccountId: bank,
        counterAccountId: input.expenseId,
        idempotencyKey: `spend-${date}`,
      })
    const budget = await getBudget(input.organizationId, input.actorId, 2026)
    expect(budget.cells).toEqual([
      expect.objectContaining({
        month: 1,
        realizedCents: '18000',
        availableCents: '-8000',
      }),
      expect.objectContaining({
        month: 10,
        realizedCents: '5000',
        availableCents: '15000',
      }),
    ])
  })
  it('transfers 30 EUR between months with unchanged annual total and before/after history', async () => {
    const input = await setup()
    await reviseBudget({
      ...input,
      annualCents: 10000,
      cells: [{ month: 10, accountId: input.expenseId, plannedCents: 10000 }],
    })
    expect(
      await transferBudget({
        ...input,
        expectedVersion: 1,
        idempotencyKey: 'transfer',
        from: { month: 10, accountId: input.expenseId },
        to: { month: 11, accountId: input.expenseId },
        amountCents: 3000,
        reason: 'Move to November',
      }),
    ).toEqual({ version: 2 })
    const result = await getBudget(input.organizationId, input.actorId, 2026)
    expect(result).toMatchObject({
      annualCents: 10000,
      plannedCents: '10000',
      undistributedCents: '0',
    })
    expect(result.cells).toEqual([
      expect.objectContaining({ month: 10, plannedCents: 7000 }),
      expect.objectContaining({ month: 11, plannedCents: 3000 }),
    ])
    expect(result.history[1]).toMatchObject({
      action: 'transfer',
      reason: 'Move to November',
      data: {
        before: {
          cells: [
            { month: 10, accountId: input.expenseId, plannedCents: 10000 },
          ],
        },
        after: {
          cells: [
            { month: 10, accountId: input.expenseId, plannedCents: 7000 },
            { month: 11, accountId: input.expenseId, plannedCents: 3000 },
          ],
        },
      },
    })
  })
  it('derives budget identity from the session and denies anonymous, foreign and editor writes', async () => {
    const input = await setup()
    await testSql`insert into sessions (session_token,user_id,expires) values ('budget-session',${input.actorId},now()+interval '1 hour')`
    const request = (body?: unknown, session = 'budget-session') =>
      new NextRequest(
        `http://localhost/api/organizations/${input.organizationId}/budgets/2026`,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            host: 'localhost',
            'x-forwarded-proto': 'http',
            origin: 'http://localhost',
            'content-type': 'application/json',
            cookie: `authjs.session-token=${session}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
    const context = {
      params: Promise.resolve({
        organizationId: input.organizationId,
        year: '2026',
      }),
    }
    const body = {
      ...input,
      actorId: 'forged',
      organizationId: 'forged',
      year: 1999,
      action: 'revise',
      annualCents: 7000000,
    }
    expect((await POST(request(body), context)).status).toBe(200)
    expect(await (await GET(request(), context)).json()).toMatchObject({
      year: 2026,
      annualCents: 7000000,
      version: 1,
    })
    expect((await GET(request(undefined, ''), context)).status).toBe(401)
    expect(
      (
        await GET(request(), {
          params: Promise.resolve({
            organizationId: crypto.randomUUID(),
            year: '2026',
          }),
        })
      ).status,
    ).toBe(403)
    await testSql`update memberships set role='editor' where organization_id=${input.organizationId}`
    expect(
      (
        await POST(
          request({ ...body, idempotencyKey: 'editor', expectedVersion: 1 }),
          context,
        )
      ).status,
    ).toBe(403)
  })
  it('denies browser-role table reads even if a SELECT grant is accidentally added', async () => {
    const protections = await testSql`
      select c.relname, c.relrowsecurity,
        exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
          where a.grantee = 0) as public_grant
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('budgets','budget_cells','budget_events')
      order by c.relname`
    expect(protections).toEqual([
      { relname: 'budget_cells', relrowsecurity: true, public_grant: false },
      { relname: 'budget_events', relrowsecurity: true, public_grant: false },
      { relname: 'budgets', relrowsecurity: true, public_grant: false },
    ])
    const input = await setup()
    await reviseBudget({
      ...input,
      annualCents: 10000,
      cells: [{ month: 10, accountId: input.expenseId, plannedCents: 10000 }],
    })
    await testSql`create role cfo_budget_browser_test nologin`
    try {
      await testSql`grant usage on schema public to cfo_budget_browser_test`
      await testSql`grant select on budgets,budget_cells,budget_events to cfo_budget_browser_test`
      await testSql.begin(async (sql) => {
        await sql`set local role cfo_budget_browser_test`
        expect(await sql`select id from budgets`).toEqual([])
        expect(await sql`select budget_id from budget_cells`).toEqual([])
        expect(await sql`select id from budget_events`).toEqual([])
      })
    } finally {
      await testSql`drop owned by cfo_budget_browser_test`
      await testSql`drop role cfo_budget_browser_test`
    }
  })
  it('allows overallocation, replays revisions once and rejects stale concurrent revisions', async () => {
    const input = await setup()
    const revision = {
      ...input,
      annualCents: 100,
      cells: [{ month: 1, accountId: input.expenseId, plannedCents: 200 }],
    }
    await reviseBudget(revision)
    expect(await reviseBudget(revision)).toEqual({ version: 1 })
    const budget = await getBudget(
      input.organizationId,
      input.actorId,
      input.year,
    )
    expect(budget).toMatchObject({
      undistributedCents: '-100',
      warnings: ['overallocated'],
    })
    expect(budget.history).toHaveLength(1)
    const results = await Promise.allSettled([
      reviseBudget({
        ...input,
        expectedVersion: 1,
        idempotencyKey: 'one',
        annualCents: 300,
      }),
      reviseBudget({
        ...input,
        expectedVersion: 1,
        idempotencyKey: 'two',
        annualCents: 400,
      }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(
      (await getBudget(input.organizationId, input.actorId, input.year))
        .history,
    ).toHaveLength(2)
  })
  it('rejects invalid cents, months, category and insufficient transfers without partial changes', async () => {
    const input = await setup()
    for (const annualCents of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(reviseBudget({ ...input, annualCents })).rejects.toThrow()
    }
    await expect(
      reviseBudget({
        ...input,
        cells: [{ month: 13, accountId: input.expenseId, plannedCents: 10 }],
      }),
    ).rejects.toThrow()
    await expect(
      reviseBudget({
        ...input,
        cells: [{ month: 1, accountId: crypto.randomUUID(), plannedCents: 10 }],
      }),
    ).rejects.toThrow()
    await reviseBudget({
      ...input,
      annualCents: 100,
      cells: [{ month: 1, accountId: input.expenseId, plannedCents: 50 }],
    })
    await expect(
      transferBudget({
        ...input,
        expectedVersion: 1,
        idempotencyKey: 'insufficient',
        from: { month: 1, accountId: input.expenseId },
        to: { month: 2, accountId: input.expenseId },
        amountCents: 51,
      }),
    ).rejects.toThrow()
    const budget = await getBudget(
      input.organizationId,
      input.actorId,
      input.year,
    )
    expect(budget).toMatchObject({ version: 1, plannedCents: '50' })
    expect(budget.history).toHaveLength(1)
    expect(budget.cells).toHaveLength(1)
  })
})
