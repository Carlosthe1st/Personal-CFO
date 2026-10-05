import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { postJournal } from '../src/server/journal'
import { exportReport } from '../src/server/report-export'

describe.skipIf(!process.env.DATABASE_URL_TEST)('report export', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)

  async function setup() {
    const [user] =
      await testSql`insert into users (email) values ('export@example.test') returning id`
    const organization = await createOrganization(user.id, 'Relatório')
    const accounts = await listAccounts(organization.id, user.id)
    const bank = accounts.find((account) => account.code === 'BANCO')!.id
    const expense = accounts.find((account) => account.code === 'DESPESA')!.id
    return {
      userId: user.id as string,
      organizationId: organization.id,
      bank,
      expense,
    }
  }

  it('exports every posted line after the 500-line preview limit', async () => {
    const context = await setup()
    for (let entry = 0; entry < 3; entry++) {
      await postJournal({
        organizationId: context.organizationId,
        actorId: context.userId,
        date: '2026-10-01',
        description: `Lote ${entry}`,
        idempotencyKey: `export-${entry}`,
        lines: [
          ...Array.from({ length: 100 }, () => ({
            accountId: context.expense,
            side: 'debit' as const,
            amountCents: 1,
          })),
          ...Array.from({ length: 100 }, () => ({
            accountId: context.bank,
            side: 'credit' as const,
            amountCents: 1,
          })),
        ],
      })
    }
    const result = await exportReport({
      organizationId: context.organizationId,
      actorId: context.userId,
      from: '2026-10-01',
      to: '2026-10-31',
      format: 'csv',
    })
    const csv = new TextDecoder().decode(result.body)
    expect(result.contentType).toContain('text/csv')
    expect(csv).toContain('Lote 2')
    expect(csv.trimEnd().split('\r\n')).toHaveLength(601)
  })

  it('blocks other organizations and neutralizes spreadsheet formulas', async () => {
    const context = await setup()
    const [outsider] =
      await testSql`insert into users (email) values ('outsider-export@example.test') returning id`
    const other = await createOrganization(outsider.id, 'Outra')
    await postJournal({
      organizationId: context.organizationId,
      actorId: context.userId,
      date: '2026-10-02',
      description: '=HYPERLINK("evil")',
      idempotencyKey: 'formula',
      lines: [
        { accountId: context.expense, side: 'debit', amountCents: 100 },
        { accountId: context.bank, side: 'credit', amountCents: 100 },
      ],
    })
    const input = {
      organizationId: context.organizationId,
      actorId: context.userId,
      from: '2026-10-01',
      to: '2026-10-31',
      format: 'csv' as const,
    }
    const csv = new TextDecoder().decode((await exportReport(input)).body)
    expect(csv).toContain("'=HYPERLINK")
    await expect(
      exportReport({ ...input, organizationId: other.id }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      exportReport({ ...input, actorId: outsider.id }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('renders a PDF for the same reporting period', async () => {
    const context = await setup()
    const result = await exportReport({
      organizationId: context.organizationId,
      actorId: context.userId,
      from: '2026-10-01',
      to: '2026-10-31',
      format: 'pdf',
    })
    expect(result.contentType).toBe('application/pdf')
    expect(new TextDecoder().decode(result.body.slice(0, 8))).toContain('%PDF')
  })
})
