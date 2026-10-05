import 'server-only'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { accounts, journalEntries, journalLines } from '../db/schema'
import { InvalidInputError, requireMember, uuidPattern } from './authorization'

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}
export function assertReportPeriod(
  from: string,
  to: string,
  accountId?: string,
) {
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    (accountId && !uuidPattern.test(accountId))
  )
    throw new InvalidInputError()
}
export async function getReports(
  organizationId: string,
  actorId: string,
  from: string,
  to: string,
  accountId?: string,
) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  assertReportPeriod(from, to, accountId)
  return getDb().transaction(
    async (tx) => {
      const balances = await tx
        .select({
          id: accounts.id,
          code: accounts.code,
          name: accounts.name,
          kind: accounts.kind,
          openingCents: sql<string>`sum(case when ${journalEntries.date} < ${from} then case when ${journalLines.side}='debit' then ${journalLines.amountCents} else -${journalLines.amountCents} end else 0 end)::text`,
          debitCents: sql<string>`sum(case when ${journalEntries.date} between ${from} and ${to} and ${journalLines.side}='debit' then ${journalLines.amountCents} else 0 end)::text`,
          creditCents: sql<string>`sum(case when ${journalEntries.date} between ${from} and ${to} and ${journalLines.side}='credit' then ${journalLines.amountCents} else 0 end)::text`,
        })
        .from(accounts)
        .leftJoin(
          journalLines,
          and(
            eq(journalLines.accountId, accounts.id),
            eq(journalLines.organizationId, accounts.organizationId),
          ),
        )
        .leftJoin(
          journalEntries,
          and(
            eq(journalEntries.id, journalLines.entryId),
            eq(journalEntries.organizationId, accounts.organizationId),
            eq(journalEntries.status, 'posted'),
          ),
        )
        .where(eq(accounts.organizationId, organizationId))
        .groupBy(accounts.id, accounts.code, accounts.name, accounts.kind)
        .orderBy(asc(accounts.code))
      const rows = balances.map((account) => ({
        ...account,
        balanceCents: (
          BigInt(account.openingCents) +
          BigInt(account.debitCents) -
          BigInt(account.creditCents)
        ).toString(),
      }))
      const total = (kinds: string[], period = false) =>
        rows
          .filter((account) => kinds.includes(account.kind))
          .reduce(
            (sum, account) =>
              sum +
              (period
                ? BigInt(account.debitCents) - BigInt(account.creditCents)
                : BigInt(account.balanceCents)),
            BigInt(0),
          )
      const assets = total(['cash', 'bank', 'asset']),
        liabilities = -total(['liability']),
        equity = -total(['equity']),
        retainedResult = -total(['income', 'expense'])
      const income = -total(['income'], true),
        expenses = total(['expense'], true)
      const ledger = await tx
        .select({
          entryId: journalEntries.id,
          date: journalEntries.date,
          description: journalEntries.description,
          accountId: accounts.id,
          code: accounts.code,
          name: accounts.name,
          side: journalLines.side,
          amountCents: journalLines.amountCents,
        })
        .from(journalEntries)
        .innerJoin(
          journalLines,
          and(
            eq(journalLines.entryId, journalEntries.id),
            eq(journalLines.organizationId, journalEntries.organizationId),
          ),
        )
        .innerJoin(
          accounts,
          and(
            eq(accounts.id, journalLines.accountId),
            eq(accounts.organizationId, journalEntries.organizationId),
          ),
        )
        .where(
          and(
            eq(journalEntries.organizationId, organizationId),
            eq(journalEntries.status, 'posted'),
            gte(journalEntries.date, from),
            lte(journalEntries.date, to),
            accountId ? eq(accounts.id, accountId) : undefined,
          ),
        )
        .orderBy(
          asc(journalEntries.date),
          asc(journalEntries.id),
          asc(accounts.code),
        )
        .limit(501)
      return {
        from,
        to,
        accounts: rows,
        trialBalance: {
          debitCents: rows
            .reduce((sum, row) => sum + BigInt(row.debitCents), BigInt(0))
            .toString(),
          creditCents: rows
            .reduce((sum, row) => sum + BigInt(row.creditCents), BigInt(0))
            .toString(),
        },
        balanceSheet: {
          assetsCents: assets.toString(),
          liabilitiesCents: liabilities.toString(),
          equityCents: equity.toString(),
          retainedResultCents: retainedResult.toString(),
          differenceCents: (
            assets -
            liabilities -
            equity -
            retainedResult
          ).toString(),
        },
        incomeStatement: {
          incomeCents: income.toString(),
          expensesCents: expenses.toString(),
          resultCents: (income - expenses).toString(),
        },
        warnings: rows.some(
          (account) =>
            account.kind === 'other' &&
            BigInt(account.balanceCents) !== BigInt(0),
        )
          ? ['unclassified_accounts']
          : [],
        ledger: ledger
          .slice(0, 500)
          .map((line) => ({ ...line, amountCents: String(line.amountCents) })),
        ledgerTruncated: ledger.length > 500,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
