import 'server-only'
import { createHash } from 'node:crypto'
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  budgets,
  fundAllocationEvents,
  fundAllocations,
  funds,
  movementChanges,
  movements,
  organizations,
} from '../db/schema'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  requireMember,
  uuidPattern,
} from './authorization'

type Address = { fundId: string; month: number }
type Change = {
  organizationId: string
  actorId: string
  year: number
  operationId: string
  mode: 'revise' | 'transfer'
  reason: string
  from?: Address
  to: Address
  amountCents: number
}

function assertYear(year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 9998)
    throw new InvalidInputError()
}
function assertAddress(address: Address) {
  if (
    !address ||
    !uuidPattern.test(address.fundId) ||
    !Number.isInteger(address.month) ||
    address.month < 1 ||
    address.month > 12
  )
    throw new InvalidInputError()
}

export async function getFundBudget(
  organizationId: string,
  actorId: string,
  year: number,
) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  assertYear(year)
  const db = getDb()
  const [fundRows, allocationRows, realizedRows, eventRows, annualRows] =
    await Promise.all([
      db
        .select()
        .from(funds)
        .where(eq(funds.organizationId, organizationId))
        .orderBy(asc(funds.name)),
      db
        .select()
        .from(fundAllocations)
        .where(
          and(
            eq(fundAllocations.organizationId, organizationId),
            eq(fundAllocations.year, year),
          ),
        ),
      db
        .select({
          fundId: movements.fundId,
          month: sql<string>`extract(month from ${movements.date})::text`,
          realizedCents: sql<string>`sum(case when ${movements.type}='expense' then ${movements.amountCents} else -${movements.amountCents} end)::text`,
        })
        .from(movements)
        .leftJoin(
          movementChanges,
          and(
            eq(movementChanges.movementId, movements.id),
            eq(movementChanges.organizationId, movements.organizationId),
          ),
        )
        .where(
          and(
            eq(movements.organizationId, organizationId),
            gte(movements.date, `${year}-01-01`),
            lt(movements.date, `${year + 1}-01-01`),
            isNull(movementChanges.id),
          ),
        )
        .groupBy(movements.fundId, sql`extract(month from ${movements.date})`),
      db
        .select()
        .from(fundAllocationEvents)
        .where(
          and(
            eq(fundAllocationEvents.organizationId, organizationId),
            eq(fundAllocationEvents.year, year),
          ),
        )
        .orderBy(asc(fundAllocationEvents.createdAt)),
      db
        .select({ annualCents: budgets.annualCents })
        .from(budgets)
        .where(
          and(
            eq(budgets.organizationId, organizationId),
            eq(budgets.year, year),
          ),
        ),
    ])
  const realized = new Map(
    realizedRows.map((row) => [
      `${row.fundId}:${Number(row.month)}`,
      row.realizedCents,
    ]),
  )
  const addresses = new Map(
    allocationRows.map((row) => [
      `${row.fundId}:${row.month}`,
      { fundId: row.fundId, month: row.month, plannedCents: row.plannedCents },
    ]),
  )
  for (const row of realizedRows)
    if (row.fundId && fundRows.some((fund) => fund.id === row.fundId)) {
      const month = Number(row.month)
      if (!addresses.has(`${row.fundId}:${month}`))
        addresses.set(`${row.fundId}:${month}`, {
          fundId: row.fundId,
          month,
          plannedCents: 0,
        })
    }
  const cells = [...addresses.values()]
    .map((row) => ({
      ...row,
      realizedCents: realized.get(`${row.fundId}:${row.month}`) ?? '0',
      availableCents: (
        BigInt(row.plannedCents) -
        BigInt(realized.get(`${row.fundId}:${row.month}`) ?? '0')
      ).toString(),
    }))
    .sort((a, b) => a.month - b.month || a.fundId.localeCompare(b.fundId))
  const plannedCents = allocationRows.reduce(
    (sum, row) => sum + BigInt(row.plannedCents),
    BigInt(0),
  )
  const annualCents = BigInt(annualRows[0]?.annualCents ?? 0)
  return {
    year,
    funds: fundRows,
    cells,
    events: eventRows,
    plannedCents: plannedCents.toString(),
    annualCents: annualCents.toString(),
    warnings: plannedCents > annualCents ? ['funds_exceed_annual'] : [],
  }
}

export async function changeFundBudget(input: Change) {
  await requireMember(input.actorId, input.organizationId, ['owner', 'admin'])
  assertYear(input.year)
  assertAddress(input.to)
  if (
    !['revise', 'transfer'].includes(input.mode) ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 0 ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.operationId) ||
    !input.reason.trim() ||
    input.reason.length > 1000
  )
    throw new InvalidInputError()
  if (input.mode === 'transfer') {
    if (!input.from || input.amountCents === 0) throw new InvalidInputError()
    assertAddress(input.from)
    if (
      input.from.fundId === input.to.fundId &&
      input.from.month === input.to.month
    )
      throw new InvalidInputError()
  }
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        mode: input.mode,
        year: input.year,
        from: input.from ?? null,
        to: input.to,
        amountCents: input.amountCents,
        reason: input.reason.trim(),
      }),
    )
    .digest('hex')
  return getDb().transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .for('update')
    const [replay] = await tx
      .select()
      .from(fundAllocationEvents)
      .where(
        and(
          eq(fundAllocationEvents.organizationId, input.organizationId),
          eq(fundAllocationEvents.operationId, input.operationId),
        ),
      )
    if (replay) {
      if (replay.requestHash !== hash) throw new ConflictError()
      return { id: replay.id }
    }
    const addresses = input.from ? [input.from, input.to] : [input.to]
    const selected = await tx
      .select({ id: funds.id })
      .from(funds)
      .where(
        and(
          eq(funds.organizationId, input.organizationId),
          inArray(
            funds.id,
            addresses.map((item) => item.fundId),
          ),
          eq(funds.active, true),
        ),
      )
      .for('share')
    if (selected.length !== new Set(addresses.map((item) => item.fundId)).size)
      throw new ForbiddenError()
    const existing = await tx
      .select()
      .from(fundAllocations)
      .where(
        and(
          eq(fundAllocations.organizationId, input.organizationId),
          eq(fundAllocations.year, input.year),
        ),
      )
    const current = (address: Address) =>
      existing.find(
        (row) => row.fundId === address.fundId && row.month === address.month,
      )?.plannedCents ?? 0
    const before = addresses.map((address) => ({
      ...address,
      plannedCents: current(address),
    }))
    let after: typeof before
    if (input.mode === 'transfer') {
      const source = current(input.from!)
      const destination = BigInt(current(input.to)) + BigInt(input.amountCents)
      if (
        source < input.amountCents ||
        destination > BigInt(Number.MAX_SAFE_INTEGER)
      )
        throw new InvalidInputError()
      after = [
        { ...input.from!, plannedCents: source - input.amountCents },
        { ...input.to, plannedCents: Number(destination) },
      ]
    } else after = [{ ...input.to, plannedCents: input.amountCents }]
    for (const cell of after)
      await tx
        .insert(fundAllocations)
        .values({
          organizationId: input.organizationId,
          year: input.year,
          ...cell,
        })
        .onConflictDoUpdate({
          target: [
            fundAllocations.organizationId,
            fundAllocations.fundId,
            fundAllocations.year,
            fundAllocations.month,
          ],
          set: { plannedCents: cell.plannedCents },
        })
    const [event] = await tx
      .insert(fundAllocationEvents)
      .values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        year: input.year,
        operationId: input.operationId,
        requestHash: hash,
        mode: input.mode,
        reason: input.reason.trim(),
        before,
        after,
      })
      .returning({ id: fundAllocationEvents.id })
    return event
  })
}
