import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { postJournal, listJournal } from '../src/server/journal'
import { NextRequest } from 'next/server'
import {
  GET,
  POST,
} from '../src/app/api/organizations/[organizationId]/journal/route'

describe.skipIf(!process.env.DATABASE_URL_TEST)('posted journal', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  async function fixture() {
    const [user] =
      await testSql`insert into users (email) values ('editor@example.test') returning id`
    const org = await createOrganization(user.id, 'Atelier')
    const accounts = await listAccounts(org.id, user.id)
    return {
      organizationId: org.id,
      actorId: user.id,
      date: '2026-10-02',
      description: 'Combustível',
      idempotencyKey: 'expense-180',
      lines: [
        {
          accountId: accounts[0].id,
          side: 'debit' as const,
          amountCents: 18000,
        },
        {
          accountId: accounts[1].id,
          side: 'credit' as const,
          amountCents: 18000,
        },
      ],
    }
  }
  it('posts a balanced 180 EUR entry and retrieves its exact lines once', async () => {
    const input = await fixture()
    const posted = await postJournal(input)
    const journal = await listJournal(input.organizationId, input.actorId)
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({
      id: posted.id,
      description: 'Combustível',
      date: '2026-10-02',
      status: 'posted',
      lines: input.lines,
    })
  })
  it.each([17999, 18000.5, 0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid or unbalanced cents %s without leaving a journal',
    async (amount) => {
      const input = await fixture()
      input.lines[1].amountCents = amount
      await expect(postJournal(input)).rejects.toMatchObject({ status: 400 })
      expect(await listJournal(input.organizationId, input.actorId)).toEqual([])
    },
  )
  it('replays a concurrent identical operation once and rejects changed payloads', async () => {
    const input = await fixture()
    const [first, replay] = await Promise.all([
      postJournal(input),
      postJournal(input),
    ])
    expect(replay).toEqual(first)
    const journal = await listJournal(input.organizationId, input.actorId)
    expect(journal).toHaveLength(1)
    expect(journal[0].lines).toHaveLength(2)
    expect(journal[0].events).toEqual([{ action: 'journal.posted' }])
    await expect(
      postJournal({ ...input, description: 'Changed' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await listJournal(input.organizationId, input.actorId)).toEqual(
      journal,
    )
  })
  it('denies readers and foreign accounts without committing partial data', async () => {
    const input = await fixture()
    const other = await createOrganization(input.actorId, 'Other')
    const otherAccounts = await listAccounts(other.id, input.actorId)
    await expect(
      postJournal({
        ...input,
        lines: [
          { ...input.lines[0], accountId: otherAccounts[0].id },
          input.lines[1],
        ],
      }),
    ).rejects.toMatchObject({ status: 403 })
    await testSql`update memberships set role='reader' where organization_id=${input.organizationId}`
    await expect(postJournal(input)).rejects.toMatchObject({ status: 403 })
    expect(await listJournal(input.organizationId, input.actorId)).toEqual([])
    const [counts] =
      await testSql`select (select count(*) from journal_entries)::int as entries, (select count(*) from journal_lines)::int as lines, (select count(*) from audit_events)::int as events`
    expect(counts).toEqual({ entries: 0, lines: 0, events: 0 })
  })
  it.each(['2026-02-30', '2026-13-01', 'invalid'])(
    'rejects invalid calendar date %s before a write',
    async (date) => {
      const input = await fixture()
      await expect(postJournal({ ...input, date })).rejects.toMatchObject({
        status: 400,
      })
      expect(await listJournal(input.organizationId, input.actorId)).toEqual([])
    },
  )
  it('posts through the session-authorized route and hides raw validation errors', async () => {
    const input = await fixture()
    await testSql`insert into sessions (session_token, user_id, expires) values ('journal-session', ${input.actorId}, now() + interval '1 hour')`
    const url = `http://localhost/api/organizations/${input.organizationId}/journal`
    const context = {
      params: Promise.resolve({ organizationId: input.organizationId }),
    }
    const headers = {
      host: 'localhost',
      'x-forwarded-proto': 'http',
      cookie: 'authjs.session-token=journal-session',
      origin: 'http://localhost',
      'content-type': 'application/json',
    }
    const post = (body: unknown) =>
      POST(
        new NextRequest(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
        context,
      )
    expect((await post({ ...input, actorId: 'forged' })).status).toBe(201)
    const journalResponse = await GET(
      new NextRequest(url, { headers }),
      context,
    )
    expect(journalResponse.status).toBe(200)
    const journal = await journalResponse.json()
    expect(journal).toHaveLength(1)
    expect(journal[0].actorId).toBe(input.actorId)
    expect((await post({ ...input, description: 'Changed' })).status).toBe(409)
    const invalid = await post({ ...input, date: '2026-02-30' })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'Dados inválidos.' })
    expect(
      (
        await POST(
          new NextRequest(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ padding: 'x'.repeat(17000) }),
          }),
          context,
        )
      ).status,
    ).toBe(400)
  })
  it('keeps posted entries and lines immutable even at the database boundary', async () => {
    const input = await fixture()
    const posted = await postJournal(input)
    await expect(
      testSql`update journal_entries set description='Rewritten' where id=${posted.id}`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      testSql`delete from journal_entries where id=${posted.id}`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      testSql`update journal_lines set amount_cents=1 where entry_id=${posted.id}`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      testSql`insert into journal_lines (organization_id,entry_id,account_id,side,amount_cents) values (${input.organizationId},${posted.id},${input.lines[0].accountId},'debit',1)`,
    ).rejects.toMatchObject({ code: '23514' })
    expect(
      (await listJournal(input.organizationId, input.actorId))[0].description,
    ).toBe('Combustível')
  })
})
