import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import {
  createMovement,
  listMovements,
  changeMovement,
} from '../src/server/movements'
import { listJournal } from '../src/server/journal'
import { NextRequest } from 'next/server'
import { POST } from '../src/app/api/organizations/[organizationId]/movements/[movementId]/changes/route'

describe.skipIf(!process.env.DATABASE_URL_TEST)('movement corrections', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  async function setup() {
    const [user] =
      await testSql`insert into users (email) values ('changes@example.test') returning id`
    const org = await createOrganization(user.id, 'Corrections')
    const accounts = await listAccounts(org.id, user.id)
    const input = {
      organizationId: org.id,
      actorId: user.id,
      type: 'expense' as const,
      date: '2026-10-03',
      description: 'Fuel',
      amountCents: 18000,
      financialAccountId: accounts.find((a) => a.code === 'BANCO')!.id,
      counterAccountId: accounts.find((a) => a.code === 'DESPESA')!.id,
      idempotencyKey: 'original',
    }
    const movement = await createMovement(input)
    return { input, movement }
  }
  it('removes an expense by exact reversal while preserving original and history once', async () => {
    const { input, movement } = await setup()
    const operation = {
      organizationId: input.organizationId,
      actorId: input.actorId,
      movementId: movement.id,
      idempotencyKey: 'remove',
      reason: 'Duplicate receipt',
    }
    const result = await changeMovement(operation)
    expect(await changeMovement(operation)).toEqual(result)
    const rows = await listMovements(input.organizationId, input.actorId)
    expect(rows).toEqual([
      expect.objectContaining({
        id: movement.id,
        amountCents: 18000,
        status: 'removed',
        change: expect.objectContaining({
          reason: 'Duplicate receipt',
          actorId: input.actorId,
          reversalEntryId: result.reversalEntryId,
        }),
      }),
    ])
    const entries = await listJournal(input.organizationId, input.actorId)
    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.id === result.reversalEntryId)).toMatchObject({
      date: '2026-10-03',
      lines: expect.arrayContaining([
        {
          accountId: input.counterAccountId,
          side: 'credit',
          amountCents: 18000,
        },
        {
          accountId: input.financialAccountId,
          side: 'debit',
          amountCents: 18000,
        },
      ]),
    })
    expect(
      entries.find((e) => e.id === movement.journalEntryId)?.description,
    ).toBe('Fuel')
  })
  it('corrects 180 to 150 EUR in another authorized organization and month atomically', async () => {
    const { input, movement } = await setup()
    const destination = await createOrganization(input.actorId, 'Destination')
    const accounts = await listAccounts(destination.id, input.actorId)
    const replacement = {
      ...input,
      organizationId: destination.id,
      date: '2026-11-04',
      description: 'Correct fuel',
      amountCents: 15000,
      financialAccountId: accounts.find((a) => a.code === 'CAIXA')!.id,
      counterAccountId: accounts.find((a) => a.code === 'DESPESA')!.id,
    }
    const operation = {
      organizationId: input.organizationId,
      actorId: input.actorId,
      movementId: movement.id,
      idempotencyKey: 'correct',
      reason: 'Wrong organization and amount',
      replacement,
    }
    const result = await changeMovement(operation)
    expect(await changeMovement(operation)).toEqual(result)
    expect(await listMovements(input.organizationId, input.actorId)).toEqual([
      expect.objectContaining({
        id: movement.id,
        amountCents: 18000,
        status: 'corrected',
        change: expect.objectContaining({
          replacementOrganizationId: destination.id,
          replacementMovementId: result.replacementMovementId,
        }),
      }),
    ])
    expect(await listMovements(destination.id, input.actorId)).toEqual([
      expect.objectContaining({
        id: result.replacementMovementId,
        date: '2026-11-04',
        amountCents: 15000,
        status: 'active',
      }),
    ])
    expect(await listJournal(input.organizationId, input.actorId)).toHaveLength(
      2,
    )
    expect(await listJournal(destination.id, input.actorId)).toEqual([
      expect.objectContaining({
        lines: expect.arrayContaining([
          {
            accountId: replacement.counterAccountId,
            side: 'debit',
            amountCents: 15000,
          },
        ]),
        events: expect.arrayContaining([{ action: 'movement.replacement' }]),
      }),
    ])
  })
  it('can reverse historical accounts that were deactivated without allowing new postings to them', async () => {
    const { input, movement } = await setup()
    await testSql`update accounts set active=false where id=${input.counterAccountId}`
    await changeMovement({
      organizationId: input.organizationId,
      actorId: input.actorId,
      movementId: movement.id,
      idempotencyKey: 'inactive-reversal',
      reason: 'Remove historical entry',
    })
    expect(await listJournal(input.organizationId, input.actorId)).toHaveLength(
      2,
    )
    await expect(
      createMovement({ ...input, idempotencyKey: 'inactive-new' }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('authenticates API corrections and ignores forged actor/source identifiers', async () => {
    const { input, movement } = await setup()
    await testSql`insert into sessions (session_token,user_id,expires) values ('change-session',${input.actorId},now()+interval '1 hour')`
    const request = (cookie = 'change-session') =>
      new NextRequest('http://localhost/api/changes', {
        method: 'POST',
        headers: {
          host: 'localhost',
          origin: 'http://localhost',
          'x-forwarded-proto': 'http',
          'content-type': 'application/json',
          cookie: `authjs.session-token=${cookie}`,
        },
        body: JSON.stringify({
          organizationId: 'forged',
          actorId: 'forged',
          reason: 'Duplicate',
          idempotencyKey: 'api-remove',
        }),
      })
    const context = {
      params: Promise.resolve({
        organizationId: input.organizationId,
        movementId: movement.id,
      }),
    }
    expect((await POST(request(''), context)).status).toBe(401)
    expect((await POST(request(), context)).status).toBe(200)
    expect(await listMovements(input.organizationId, input.actorId)).toEqual([
      expect.objectContaining({
        status: 'removed',
        change: expect.objectContaining({ actorId: input.actorId }),
      }),
    ])
    await testSql`update memberships set role='reader' where organization_id=${input.organizationId}`
    expect((await POST(request(), context)).status).toBe(403)
  })
  it('requires write permission in both organizations and rejects invalid replacement without reversal', async () => {
    const { input, movement } = await setup()
    const destination = await createOrganization(input.actorId, 'Other')
    const accounts = await listAccounts(destination.id, input.actorId)
    const replacement = {
      ...input,
      organizationId: destination.id,
      financialAccountId: accounts.find((a) => a.code === 'BANCO')!.id,
      counterAccountId: accounts.find((a) => a.code === 'DESPESA')!.id,
    }
    const operation = {
      organizationId: input.organizationId,
      actorId: input.actorId,
      movementId: movement.id,
      idempotencyKey: 'denied',
      reason: 'Move',
      replacement,
    }
    await testSql`update memberships set role='reader' where organization_id=${destination.id}`
    await expect(changeMovement(operation)).rejects.toMatchObject({
      status: 403,
    })
    await testSql`update memberships set role='owner' where organization_id=${destination.id}`
    await expect(
      changeMovement({
        ...operation,
        replacement: { ...replacement, amountCents: 0.5 },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      changeMovement({ ...operation, organizationId: destination.id }),
    ).rejects.toMatchObject({ status: 403 })
    expect(await listJournal(input.organizationId, input.actorId)).toHaveLength(
      1,
    )
    expect(await listJournal(destination.id, input.actorId)).toEqual([])
    expect(
      (await listMovements(input.organizationId, input.actorId))[0].status,
    ).toBe('active')
  })
  it('serializes conflicting edits and rejects a changed retry payload', async () => {
    const { input, movement } = await setup()
    const operation = {
      organizationId: input.organizationId,
      actorId: input.actorId,
      movementId: movement.id,
      idempotencyKey: 'same',
      reason: 'Remove',
    }
    const results = await Promise.all([
      changeMovement(operation),
      changeMovement(operation),
    ])
    expect(results[0]).toEqual(results[1])
    await expect(
      changeMovement({ ...operation, reason: 'Changed' }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      changeMovement({ ...operation, idempotencyKey: 'other' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await listJournal(input.organizationId, input.actorId)).toHaveLength(
      2,
    )
  })
  it('rejects reuse of a change key on another movement as a conflict', async () => {
    const { input, movement } = await setup()
    const other = await createMovement({ ...input, idempotencyKey: 'second' })
    const operation = {
      organizationId: input.organizationId,
      actorId: input.actorId,
      movementId: movement.id,
      idempotencyKey: 'reused',
      reason: 'Remove',
    }
    await changeMovement(operation)
    await expect(
      changeMovement({ ...operation, movementId: other.id }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await listJournal(input.organizationId, input.actorId)).toHaveLength(
      3,
    )
  })
  it('has RLS and no public or browser grants on correction history', async () => {
    const rows =
      await testSql`select c.relrowsecurity, exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0 or a.grantee in(select oid from pg_roles where rolname in('anon','authenticated','service_role'))) as browser_grant from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='movement_changes'`
    expect(rows).toEqual([{ relrowsecurity: true, browser_grant: false }])
  })
  it('rolls back reversal, replacement and audit when storing correction history fails', async () => {
    const { input, movement } = await setup()
    await testSql`alter table movement_changes add constraint reject_change check(reason <> 'Reject')`
    try {
      await expect(
        changeMovement({
          organizationId: input.organizationId,
          actorId: input.actorId,
          movementId: movement.id,
          idempotencyKey: 'rollback',
          reason: 'Reject',
          replacement: { ...input, amountCents: 15000 },
        }),
      ).rejects.toThrow()
      expect(
        await listJournal(input.organizationId, input.actorId),
      ).toHaveLength(1)
      expect(await listMovements(input.organizationId, input.actorId)).toEqual([
        expect.objectContaining({ status: 'active' }),
      ])
    } finally {
      await testSql`alter table movement_changes drop constraint reject_change`
    }
  })
})
