import 'server-only'
import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  accounts,
  journalEntries,
  journalLines,
  movements,
  recurrenceOccurrences,
} from '../db/schema'
import { InvalidInputError, requireMember } from './authorization'
import { listDueOccurrences } from './recurrences'

export async function getCashForecast(
  organizationId: string,
  actorId: string,
  today: string,
) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  const date = new Date(`${today}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== today
  )
    throw new InvalidInputError()
  const horizon = new Date(date.getTime() + 90 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const firstFuture = new Date(date.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)
  const confirmed = await getDb()
    .select({
      date: journalEntries.date,
      delta: sql<string>`sum(case when ${journalLines.side}='debit' then ${journalLines.amountCents} else -${journalLines.amountCents} end)::text`,
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
    .leftJoin(
      movements,
      and(
        eq(movements.journalEntryId, journalEntries.id),
        eq(movements.organizationId, organizationId),
      ),
    )
    .leftJoin(
      recurrenceOccurrences,
      and(
        eq(recurrenceOccurrences.movementId, movements.id),
        eq(recurrenceOccurrences.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(journalEntries.organizationId, organizationId),
        eq(journalEntries.status, 'posted'),
        lte(journalEntries.date, horizon),
        or(
          lte(journalEntries.date, today),
          isNotNull(recurrenceOccurrences.movementId),
        ),
        or(eq(accounts.kind, 'cash'), eq(accounts.kind, 'bank')),
      ),
    )
    .groupBy(journalEntries.date)
  const actual = confirmed
    .filter((row) => row.date <= today)
    .reduce((sum, row) => sum + BigInt(row.delta), BigInt(0))
  const future = new Map<string, bigint>()
  for (const row of confirmed)
    if (row.date > today)
      future.set(
        row.date,
        (future.get(row.date) ?? BigInt(0)) + BigInt(row.delta),
      )
  const proposals = await listDueOccurrences(
    organizationId,
    actorId,
    horizon,
    firstFuture,
  )
  for (const proposal of proposals)
    future.set(
      proposal.effectiveDate,
      (future.get(proposal.effectiveDate) ?? BigInt(0)) +
        (proposal.type === 'income'
          ? BigInt(proposal.amountCents)
          : -BigInt(proposal.amountCents)),
    )
  let projected = actual
  let minimum = actual
  const points: { date: string; projectedCents: string }[] = []
  for (let offset = 1; offset <= 90; offset++) {
    const day = new Date(date.getTime() + offset * 86_400_000)
      .toISOString()
      .slice(0, 10)
    projected += future.get(day) ?? BigInt(0)
    if (projected < minimum) minimum = projected
    points.push({ date: day, projectedCents: projected.toString() })
  }
  return {
    actualCents: actual.toString(),
    minimumProjectedCents: minimum.toString(),
    points,
    assumptions: [
      'Saldo real: lançamentos confirmados até hoje.',
      'Projeção: recorrências futuras pendentes ou confirmadas; lançamentos futuros avulsos não entram e receitas não são garantidas.',
    ],
  }
}
