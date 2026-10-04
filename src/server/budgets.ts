import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, inArray, asc, sql, gte, lt } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  accounts,
  budgets,
  budgetCells,
  budgetEvents,
  memberships,
  organizations,
  journalLines,
  journalEntries,
} from '../db/schema'
import {
  requireMember,
  InvalidInputError,
  ForbiddenError,
  ConflictError,
  uuidPattern,
} from './authorization'

type Identity = {
  organizationId: string
  actorId: string
  year: number
  expectedVersion: number
  idempotencyKey: string
  reason?: string
}
export type BudgetCell = {
  month: number
  accountId: string
  plannedCents: number
}
export type BudgetRevision = Identity & {
  annualCents?: number
  cells?: BudgetCell[]
}
type CellAddress = { month: number; accountId: string }
export type BudgetTransfer = Identity & {
  from: CellAddress
  to: CellAddress
  amountCents: number
}
function assertYear(year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 9998)
    throw new InvalidInputError()
}
function assertCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new InvalidInputError()
}
function assertCell(cell: BudgetCell) {
  if (
    !cell ||
    !Number.isInteger(cell.month) ||
    cell.month < 1 ||
    cell.month > 12 ||
    !uuidPattern.test(cell.accountId)
  )
    throw new InvalidInputError()
  assertCents(cell.plannedCents)
}
export function reviseBudget(input: BudgetRevision) {
  return changeBudget(input)
}
export function transferBudget(input: BudgetTransfer) {
  return changeBudget({
    organizationId: input.organizationId,
    actorId: input.actorId,
    year: input.year,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    transfer: {
      from: input.from,
      to: input.to,
      amountCents: input.amountCents,
    },
  })
}
async function changeBudget(
  input: BudgetRevision & {
    transfer?: Pick<BudgetTransfer, 'from' | 'to' | 'amountCents'>
  },
) {
  await requireMember(input.actorId, input.organizationId, ['owner', 'admin'])
  assertYear(input.year)
  if (
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    input.expectedVersion >= 2147483647 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey) ||
    (input.reason !== undefined &&
      (typeof input.reason !== 'string' || input.reason.length > 1000))
  )
    throw new InvalidInputError()
  if (input.annualCents !== undefined) assertCents(input.annualCents)
  if (
    input.cells !== undefined &&
    (!Array.isArray(input.cells) || input.cells.length > 200)
  )
    throw new InvalidInputError()
  let cells = (input.cells ?? [])
    .map((cell) => {
      assertCell(cell)
      return {
        month: cell.month,
        accountId: cell.accountId,
        plannedCents: cell.plannedCents,
      }
    })
    .sort((a, b) => a.month - b.month || a.accountId.localeCompare(b.accountId))
  const transfer = input.transfer
  if (transfer) {
    assertCell({ ...transfer.from, plannedCents: 0 })
    assertCell({ ...transfer.to, plannedCents: 0 })
    assertCents(transfer.amountCents)
    if (
      transfer.amountCents === 0 ||
      (transfer.from.month === transfer.to.month &&
        transfer.from.accountId === transfer.to.accountId)
    )
      throw new InvalidInputError()
  }
  if (
    (input.annualCents === undefined && !cells.length && !transfer) ||
    new Set(cells.map((c) => `${c.month}:${c.accountId}`)).size !== cells.length
  )
    throw new InvalidInputError()
  const action = transfer ? 'transfer' : 'revise'
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        actorId: input.actorId,
        action,
        year: input.year,
        expectedVersion: input.expectedVersion,
        annualCents: input.annualCents,
        cells,
        transfer,
        reason: input.reason ?? null,
      }),
    )
    .digest('hex')
  return getDb().transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.userId, input.actorId),
        ),
      )
      .for('share')
    if (!member || !['owner', 'admin'].includes(member.role))
      throw new ForbiddenError()
    const references = transfer ? [transfer.from, transfer.to] : cells
    if (references.length) {
      const selected = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.organizationId, input.organizationId),
            inArray(
              accounts.id,
              references.map((c) => c.accountId),
            ),
            eq(accounts.kind, 'expense'),
            eq(accounts.active, true),
          ),
        )
        .for('share')
      if (selected.length !== new Set(references.map((c) => c.accountId)).size)
        throw new ForbiddenError()
    }
    await tx
      .insert(budgets)
      .values({ organizationId: input.organizationId, year: input.year })
      .onConflictDoNothing({ target: [budgets.organizationId, budgets.year] })
    const [budget] = await tx
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.organizationId, input.organizationId),
          eq(budgets.year, input.year),
        ),
      )
      .for('update')
    const [replay] = await tx
      .select()
      .from(budgetEvents)
      .where(
        and(
          eq(budgetEvents.budgetId, budget.id),
          eq(budgetEvents.idempotencyKey, input.idempotencyKey),
        ),
      )
    if (replay) {
      if (replay.requestHash !== hash) throw new ConflictError()
      return { version: replay.version }
    }
    if (budget.version !== input.expectedVersion) throw new ConflictError()
    const beforeCells = await tx
      .select({
        month: budgetCells.month,
        accountId: budgetCells.accountId,
        plannedCents: budgetCells.plannedCents,
      })
      .from(budgetCells)
      .where(eq(budgetCells.budgetId, budget.id))
      .orderBy(asc(budgetCells.month), asc(budgetCells.accountId))
    if (transfer) {
      const find = (address: CellAddress) =>
        beforeCells.find(
          (cell) =>
            cell.month === address.month &&
            cell.accountId === address.accountId,
        )?.plannedCents ?? 0
      const source = find(transfer.from),
        destination = BigInt(find(transfer.to)) + BigInt(transfer.amountCents)
      if (
        source < transfer.amountCents ||
        destination > BigInt(Number.MAX_SAFE_INTEGER)
      )
        throw new InvalidInputError()
      cells = [
        { ...transfer.from, plannedCents: source - transfer.amountCents },
        { ...transfer.to, plannedCents: Number(destination) },
      ]
    }
    for (const cell of cells)
      await tx
        .insert(budgetCells)
        .values({
          ...cell,
          budgetId: budget.id,
          organizationId: input.organizationId,
        })
        .onConflictDoUpdate({
          target: [
            budgetCells.budgetId,
            budgetCells.month,
            budgetCells.accountId,
          ],
          set: { plannedCents: cell.plannedCents },
        })
    const version = budget.version + 1,
      annualCents = input.annualCents ?? budget.annualCents
    await tx
      .update(budgets)
      .set({ annualCents, version })
      .where(eq(budgets.id, budget.id))
    const afterCells = await tx
      .select({
        month: budgetCells.month,
        accountId: budgetCells.accountId,
        plannedCents: budgetCells.plannedCents,
      })
      .from(budgetCells)
      .where(eq(budgetCells.budgetId, budget.id))
      .orderBy(asc(budgetCells.month), asc(budgetCells.accountId))
    await tx.insert(budgetEvents).values({
      organizationId: input.organizationId,
      budgetId: budget.id,
      actorId: input.actorId,
      action,
      version,
      idempotencyKey: input.idempotencyKey,
      requestHash: hash,
      reason: input.reason,
      data: {
        before: { annualCents: budget.annualCents, cells: beforeCells },
        after: { annualCents, cells: afterCells },
        ...(transfer ? { transfer } : {}),
      },
    })
    return { version }
  })
}
export async function getBudget(
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
  return getDb().transaction(
    async (tx) => {
      const [budget] = await tx
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.organizationId, organizationId),
            eq(budgets.year, year),
          ),
        )
      const cells = budget
        ? await tx
            .select({
              month: budgetCells.month,
              accountId: budgetCells.accountId,
              plannedCents: budgetCells.plannedCents,
            })
            .from(budgetCells)
            .where(eq(budgetCells.budgetId, budget.id))
            .orderBy(asc(budgetCells.month), asc(budgetCells.accountId))
        : []
      const history = budget
        ? await tx
            .select()
            .from(budgetEvents)
            .where(eq(budgetEvents.budgetId, budget.id))
            .orderBy(asc(budgetEvents.version))
        : []
      const [organization] = await tx
        .select({ month: organizations.fiscalYearStartMonth })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
      const month = String(organization.month).padStart(2, '0')
      const fiscalMonth = sql<number>`((extract(month from ${journalEntries.date})::integer - ${organization.month} + 12) % 12) + 1`
      const actuals = await tx
        .select({
          month: fiscalMonth,
          accountId: journalLines.accountId,
          realizedCents: sql<string>`sum(case when ${journalLines.side}='debit' then ${journalLines.amountCents} else -${journalLines.amountCents} end)::text`,
        })
        .from(journalLines)
        .innerJoin(
          journalEntries,
          and(
            eq(journalLines.entryId, journalEntries.id),
            eq(journalLines.organizationId, journalEntries.organizationId),
          ),
        )
        .innerJoin(
          accounts,
          and(
            eq(accounts.id, journalLines.accountId),
            eq(accounts.organizationId, journalLines.organizationId),
          ),
        )
        .where(
          and(
            eq(journalEntries.organizationId, organizationId),
            eq(journalEntries.status, 'posted'),
            eq(accounts.kind, 'expense'),
            gte(journalEntries.date, `${year}-${month}-01`),
            lt(journalEntries.date, `${year + 1}-${month}-01`),
          ),
        )
        .groupBy(
          journalLines.accountId,
          sql`extract(month from ${journalEntries.date})`,
        )
      const merged = new Map(
        cells.map((cell) => [
          `${cell.month}:${cell.accountId}`,
          { ...cell, realizedCents: '0' },
        ]),
      )
      for (const actual of actuals) {
        const key = `${actual.month}:${actual.accountId}`
        merged.set(key, { plannedCents: 0, ...merged.get(key), ...actual })
      }
      const resultCells = [...merged.values()]
        .sort(
          (a, b) => a.month - b.month || a.accountId.localeCompare(b.accountId),
        )
        .map((cell) => ({
          ...cell,
          availableCents: (
            BigInt(cell.plannedCents) - BigInt(cell.realizedCents)
          ).toString(),
        }))
      const planned = cells.reduce(
          (sum, cell) => sum + BigInt(cell.plannedCents),
          BigInt(0),
        ),
        annualCents = budget?.annualCents ?? 0
      const realized = actuals.reduce(
        (sum, cell) => sum + BigInt(cell.realizedCents),
        BigInt(0),
      )
      const warnings: string[] = []
      if (planned > BigInt(annualCents)) warnings.push('overallocated')
      if (planned < BigInt(annualCents)) warnings.push('unallocated')
      if (resultCells.some((cell) => BigInt(cell.availableCents) < BigInt(0)))
        warnings.push('deficit')
      return {
        year,
        fiscalYearStartMonth: organization.month,
        version: budget?.version ?? 0,
        annualCents,
        plannedCents: planned.toString(),
        undistributedCents: (BigInt(annualCents) - planned).toString(),
        realizedCents: realized.toString(),
        availableCents: (planned - realized).toString(),
        warnings,
        cells: resultCells,
        history,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
