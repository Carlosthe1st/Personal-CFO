import 'server-only'
import { and, asc, eq, inArray, lte } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  accounts,
  funds,
  recurrenceOccurrences,
  recurrenceRules,
} from '../db/schema'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  requireMember,
  uuidPattern,
} from './authorization'
import { createMovementInTransaction } from './movements'

type Frequency = 'weekly' | 'monthly'
type RuleDates = {
  frequency: Frequency
  startDate: string
  endDate: string | null
  anchorDay: number
}
type RuleInput = {
  organizationId: string
  actorId: string
  type: 'income' | 'expense'
  frequency: Frequency
  startDate: string
  endDate: string | null
  description: string
  amountCents: number
  financialAccountId: string
  counterAccountId: string
  fundId?: string | null
}
type OccurrenceIdentity = {
  organizationId: string
  actorId: string
  ruleId: string
  dueDate: string
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}
function utc(value: string) {
  return new Date(`${value}T00:00:00Z`)
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function generateDueDates(
  rule: RuleDates,
  fromDate: string,
  throughDate: string,
) {
  if (
    !validDate(rule.startDate) ||
    !validDate(fromDate) ||
    !validDate(throughDate) ||
    (rule.endDate && !validDate(rule.endDate)) ||
    fromDate > throughDate ||
    (utc(throughDate).getTime() - utc(fromDate).getTime()) / 86_400_000 > 366 ||
    !Number.isInteger(rule.anchorDay) ||
    rule.anchorDay < 1 ||
    rule.anchorDay > 31
  )
    throw new InvalidInputError()
  const start = utc(rule.startDate),
    from = utc(fromDate),
    through = utc(throughDate)
  const end = rule.endDate ? utc(rule.endDate) : through
  const dates: string[] = []
  if (rule.frequency === 'weekly') {
    let day = start
    if (day < from)
      day = new Date(
        day.getTime() +
          Math.ceil((from.getTime() - day.getTime()) / (7 * 86_400_000)) *
            7 *
            86_400_000,
      )
    while (day <= through && day <= end) {
      dates.push(iso(day))
      if (dates.length > 60) throw new InvalidInputError()
      day = new Date(day.getTime() + 7 * 86_400_000)
    }
  } else if (rule.frequency === 'monthly') {
    let year = from.getUTCFullYear(),
      month = from.getUTCMonth() + 1
    while (
      year < through.getUTCFullYear() ||
      (year === through.getUTCFullYear() && month <= through.getUTCMonth() + 1)
    ) {
      const day = Math.min(
        rule.anchorDay,
        new Date(Date.UTC(year, month, 0)).getUTCDate(),
      )
      const candidate = new Date(Date.UTC(year, month - 1, day))
      if (
        candidate >= start &&
        candidate >= from &&
        candidate <= through &&
        candidate <= end
      )
        dates.push(iso(candidate))
      if (dates.length > 60) throw new InvalidInputError()
      month++
      if (month === 13) {
        month = 1
        year++
      }
    }
  } else throw new InvalidInputError()
  return dates
}

async function validateRule(input: RuleInput, requireActive = true) {
  await requireMember(input.actorId, input.organizationId, ['owner', 'admin'])
  if (
    !['income', 'expense'].includes(input.type) ||
    !['weekly', 'monthly'].includes(input.frequency) ||
    !validDate(input.startDate) ||
    (input.endDate &&
      (!validDate(input.endDate) || input.endDate < input.startDate)) ||
    !input.description.trim() ||
    input.description.length > 500 ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !uuidPattern.test(input.financialAccountId) ||
    !uuidPattern.test(input.counterAccountId) ||
    input.financialAccountId === input.counterAccountId ||
    (input.fundId && !uuidPattern.test(input.fundId))
  )
    throw new InvalidInputError()
  const selected = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.organizationId, input.organizationId),
        inArray(accounts.id, [
          input.financialAccountId,
          input.counterAccountId,
        ]),
        requireActive ? eq(accounts.active, true) : undefined,
      ),
    )
  if (
    selected.length !== 2 ||
    !['cash', 'bank'].includes(
      selected.find((row) => row.id === input.financialAccountId)!.kind,
    ) ||
    selected.find((row) => row.id === input.counterAccountId)!.kind !==
      input.type
  )
    throw new ForbiddenError()
  if (input.fundId) {
    const [fund] = await getDb()
      .select({ id: funds.id })
      .from(funds)
      .where(
        and(
          eq(funds.organizationId, input.organizationId),
          eq(funds.id, input.fundId),
          requireActive ? eq(funds.active, true) : undefined,
        ),
      )
    if (!fund) throw new ForbiddenError()
  }
}

export async function createRecurrence(input: RuleInput) {
  await validateRule(input)
  const [rule] = await getDb()
    .insert(recurrenceRules)
    .values({
      ...input,
      description: input.description.trim(),
      anchorDay: Number(input.startDate.slice(8, 10)),
      fundId: input.fundId ?? null,
    })
    .returning()
  return rule
}

export async function updateRecurrence(
  input: RuleInput & { ruleId: string; active: boolean },
  effectiveDate = iso(new Date()),
) {
  await validateRule(input, input.active)
  if (
    !uuidPattern.test(input.ruleId) ||
    typeof input.active !== 'boolean' ||
    !validDate(effectiveDate)
  )
    throw new InvalidInputError()
  const tomorrow = iso(new Date(utc(effectiveDate).getTime() + 86_400_000))
  const nextDate = generateDueDates(
    {
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: null,
      anchorDay: Number(input.startDate.slice(8, 10)),
    },
    tomorrow,
    iso(new Date(utc(tomorrow).getTime() + 35 * 86_400_000)),
  )[0]
  if (input.active && (!nextDate || (input.endDate && nextDate > input.endDate)))
    throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(recurrenceRules)
      .where(
        and(
          eq(recurrenceRules.id, input.ruleId),
          eq(recurrenceRules.organizationId, input.organizationId),
        ),
      )
      .for('update')
    if (!previous) throw new ForbiddenError()
    if (!previous.active) throw new ConflictError()
    const [archived] = await tx
      .update(recurrenceRules)
      .set({
        endDate:
          previous.endDate && previous.endDate < effectiveDate
            ? previous.endDate
            : effectiveDate,
        active: false,
      })
      .where(eq(recurrenceRules.id, previous.id))
      .returning()
    if (!input.active) return archived
    const [revised] = await tx
      .insert(recurrenceRules)
      .values({
        ...input,
        startDate: nextDate,
        anchorDay: Number(input.startDate.slice(8, 10)),
        description: input.description.trim(),
        fundId: input.fundId ?? null,
        version: previous.version + 1,
      })
      .returning()
    return revised
  })
}

export async function listRecurrences(organizationId: string, actorId: string) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  return getDb()
    .select()
    .from(recurrenceRules)
    .where(eq(recurrenceRules.organizationId, organizationId))
    .orderBy(asc(recurrenceRules.startDate))
}

export async function listDueOccurrences(
  organizationId: string,
  actorId: string,
  throughDate: string,
  fromDate?: string,
) {
  await requireMember(actorId, organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  const from =
    fromDate ?? iso(new Date(utc(throughDate).getTime() - 90 * 86_400_000))
  if (!validDate(from) || !validDate(throughDate)) throw new InvalidInputError()
  const rules = await getDb()
    .select()
    .from(recurrenceRules)
    .where(eq(recurrenceRules.organizationId, organizationId))
  const availableRules = rules.filter((rule) => rule.active || rule.endDate)
  const resolutions = await getDb()
    .select()
    .from(recurrenceOccurrences)
    .where(
      and(
        eq(recurrenceOccurrences.organizationId, organizationId),
        lte(recurrenceOccurrences.dueDate, throughDate),
      ),
    )
  const byKey = new Map(
    resolutions.map((row) => [`${row.ruleId}:${row.dueDate}`, row]),
  )
  const proposals = availableRules.flatMap((rule) =>
    generateDueDates(rule, from, throughDate).flatMap((dueDate) => {
      const resolution = byKey.get(`${rule.id}:${dueDate}`)
      if (
        resolution?.status === 'confirmed' ||
        resolution?.status === 'skipped'
      )
        return []
      const effectiveDate = resolution?.postponedUntil ?? dueDate
      if (effectiveDate < from || effectiveDate > throughDate) return []
      return [
        {
          ruleId: rule.id,
          dueDate,
          effectiveDate,
          type: rule.type,
          description: rule.description,
          amountCents: rule.amountCents,
          financialAccountId: rule.financialAccountId,
          counterAccountId: rule.counterAccountId,
          fundId: rule.fundId,
        },
      ]
    }),
  )
  for (const resolution of resolutions) {
    if (
      resolution.status !== 'postponed' ||
      !resolution.postponedUntil ||
      resolution.dueDate >= from ||
      resolution.postponedUntil < from ||
      resolution.postponedUntil > throughDate
    )
      continue
    const rule = availableRules.find((item) => item.id === resolution.ruleId)
    if (!rule) continue
    proposals.push({
      ruleId: rule.id,
      dueDate: resolution.dueDate,
      effectiveDate: resolution.postponedUntil,
      type: rule.type,
      description: rule.description,
      amountCents: rule.amountCents,
      financialAccountId: rule.financialAccountId,
      counterAccountId: rule.counterAccountId,
      fundId: rule.fundId,
    })
  }
  if (proposals.length > 60) throw new InvalidInputError()
  return proposals.sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.ruleId.localeCompare(b.ruleId),
  )
}

export async function confirmOccurrence(input: OccurrenceIdentity) {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
  ])
  if (!uuidPattern.test(input.ruleId) || !validDate(input.dueDate))
    throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
    const [rule] = await tx
      .select()
      .from(recurrenceRules)
      .where(
        and(
          eq(recurrenceRules.id, input.ruleId),
          eq(recurrenceRules.organizationId, input.organizationId),
        ),
      )
      .for('update')
    if (!rule || (!rule.active && !rule.endDate)) throw new ForbiddenError()
    if (
      !generateDueDates(rule, input.dueDate, input.dueDate).includes(
        input.dueDate,
      )
    )
      throw new InvalidInputError()
    const [existing] = await tx
      .select()
      .from(recurrenceOccurrences)
      .where(
        and(
          eq(recurrenceOccurrences.ruleId, input.ruleId),
          eq(recurrenceOccurrences.dueDate, input.dueDate),
        ),
      )
    if (existing?.status === 'confirmed')
      return { movementId: existing.movementId }
    if (existing?.status === 'skipped') throw new ConflictError()
    const movement = await createMovementInTransaction(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: rule.type,
      date: existing?.postponedUntil ?? input.dueDate,
      description: rule.description,
      amountCents: rule.amountCents,
      financialAccountId: rule.financialAccountId,
      counterAccountId: rule.counterAccountId,
      fundId: rule.fundId,
      idempotencyKey: `recurrence_${input.ruleId}_${input.dueDate}`,
    })
    if (existing)
      await tx
        .update(recurrenceOccurrences)
        .set({
          status: 'confirmed',
          postponedUntil: null,
          movementId: movement.id,
          actorId: input.actorId,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(recurrenceOccurrences.ruleId, input.ruleId),
            eq(recurrenceOccurrences.dueDate, input.dueDate),
          ),
        )
    else
      await tx.insert(recurrenceOccurrences).values({
        organizationId: input.organizationId,
        ruleId: input.ruleId,
        dueDate: input.dueDate,
        status: 'confirmed',
        actorId: input.actorId,
        movementId: movement.id,
      })
    return { movementId: movement.id }
  })
}

export async function skipOccurrence(
  input: OccurrenceIdentity & { postponedUntil?: string },
) {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
  ])
  if (
    !uuidPattern.test(input.ruleId) ||
    !validDate(input.dueDate) ||
    (input.postponedUntil &&
      (!validDate(input.postponedUntil) ||
        input.postponedUntil <= input.dueDate))
  )
    throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
    const [rule] = await tx
      .select()
      .from(recurrenceRules)
      .where(
        and(
          eq(recurrenceRules.id, input.ruleId),
          eq(recurrenceRules.organizationId, input.organizationId),
        ),
      )
      .for('update')
    if (!rule || (!rule.active && !rule.endDate)) throw new ForbiddenError()
    if (
      !generateDueDates(rule, input.dueDate, input.dueDate).includes(
        input.dueDate,
      )
    )
      throw new InvalidInputError()
    const [existing] = await tx
      .select()
      .from(recurrenceOccurrences)
      .where(
        and(
          eq(recurrenceOccurrences.ruleId, input.ruleId),
          eq(recurrenceOccurrences.dueDate, input.dueDate),
        ),
      )
    if (existing?.status === 'confirmed') throw new ConflictError()
    const status = input.postponedUntil
      ? ('postponed' as const)
      : ('skipped' as const)
    if (existing)
      await tx
        .update(recurrenceOccurrences)
        .set({
          status,
          postponedUntil: input.postponedUntil ?? null,
          actorId: input.actorId,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(recurrenceOccurrences.ruleId, input.ruleId),
            eq(recurrenceOccurrences.dueDate, input.dueDate),
          ),
        )
    else
      await tx.insert(recurrenceOccurrences).values({
        organizationId: input.organizationId,
        ruleId: input.ruleId,
        dueDate: input.dueDate,
        status,
        postponedUntil: input.postponedUntil ?? null,
        actorId: input.actorId,
      })
    return { status }
  })
}
