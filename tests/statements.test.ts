import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createMovement } from '../src/server/movements'
import {
  previewStatement,
  importStatement,
  reconcileLine,
  listStatementLines,
} from '../src/server/statements'

describe.skipIf(!process.env.DATABASE_URL_TEST)('bank statements', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)
  it('previews without writes, detects duplicates and imports once before manual matching', async () => {
    const [actor] =
      await testSql`insert into users (email) values ('statement@example.test') returning id`
    const org = await createOrganization(actor.id, 'Bank test')
    const accounts = await listAccounts(org.id, actor.id)
    const accountId = accounts.find((account) => account.code === 'BANCO')!.id
    const identity = {
      organizationId: org.id,
      actorId: actor.id as string,
      accountId,
    }
    const rows = [
      { date: '2026-10-01', description: 'Rent', amountCents: -18000 },
    ]
    expect(
      (await previewStatement({ ...identity, rows })).map(
        (row) => row.duplicate,
      ),
    ).toEqual([false])
    expect(await listStatementLines(identity)).toHaveLength(0)
    const imported = await importStatement({
      ...identity,
      rows,
      idempotencyKey: 'file1',
      includeDuplicates: false,
    })
    expect(imported.imported).toBe(1)
    expect(
      await importStatement({
        ...identity,
        rows,
        idempotencyKey: 'file1',
        includeDuplicates: false,
      }),
    ).toEqual(imported)
    expect((await previewStatement({ ...identity, rows }))[0].duplicate).toBe(
      true,
    )
    expect(
      (
        await importStatement({
          ...identity,
          rows,
          idempotencyKey: 'file2',
          includeDuplicates: false,
        })
      ).imported,
    ).toBe(0)
    const movement = await createMovement({
      ...identity,
      type: 'expense',
      date: rows[0].date,
      description: 'Rent',
      amountCents: 18000,
      financialAccountId: accountId,
      counterAccountId: accounts.find((account) => account.kind === 'expense')!
        .id,
      idempotencyKey: 'rent',
    })
    const [line] = await listStatementLines(identity)
    const match = {
      ...identity,
      lineId: line.id,
      entryId: movement.journalEntryId,
      expectedVersion: 0,
    }
    expect(await reconcileLine(match)).toMatchObject({
      matchedEntryId: movement.journalEntryId,
      version: 1,
    })
    expect(await reconcileLine(match)).toMatchObject({ version: 1 })
    const [{ count }] =
      await testSql`select count(*)::int as count from journal_entries where organization_id=${org.id}`
    expect(count).toBe(1)
    expect(
      await reconcileLine({ ...match, entryId: null, expectedVersion: 1 }),
    ).toMatchObject({ matchedEntryId: null, version: 2 })
    const [outsider] =
      await testSql`insert into users (email) values ('statement-outsider@example.test') returning id`
    await expect(
      listStatementLines({ ...identity, actorId: outsider.id }),
    ).rejects.toThrow()
    await expect(
      reconcileLine({ ...match, actorId: outsider.id }),
    ).rejects.toThrow()
  })
})
