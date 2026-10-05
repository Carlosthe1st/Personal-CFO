import 'server-only'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import PDFDocument from 'pdfkit'
import { getDb } from '../db/client'
import {
  accounts,
  journalEntries,
  journalLines,
  movements,
  organizations,
} from '../db/schema'
import { InvalidInputError, requireMember } from './authorization'
import { assertReportPeriod } from './reports'

export type ExportRequest = {
  organizationId: string
  actorId: string
  from: string
  to: string
  accountId?: string
  format: 'csv' | 'pdf'
}

type ExportRow = {
  date: string
  entryId: string
  lineId: string
  description: string
  code: string
  account: string
  category: string
  side: 'debit' | 'credit'
  amountCents: string
  type: string
  status: string
}

function amount(cents: string) {
  const value = BigInt(cents)
  return `${value / BigInt(100)},${String(value % BigInt(100)).padStart(2, '0')}`
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

async function queryExportRows(input: ExportRequest) {
  const records = await getDb()
    .select({
      date: journalEntries.date,
      entryId: journalEntries.id,
      lineId: journalLines.id,
      description: journalEntries.description,
      code: accounts.code,
      account: accounts.name,
      kind: accounts.kind,
      side: journalLines.side,
      amountCents: journalLines.amountCents,
      type: movements.type,
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
        eq(movements.organizationId, journalEntries.organizationId),
      ),
    )
    .where(
      and(
        eq(journalEntries.organizationId, input.organizationId),
        eq(journalEntries.status, 'posted'),
        gte(journalEntries.date, input.from),
        lte(journalEntries.date, input.to),
        input.accountId ? eq(accounts.id, input.accountId) : undefined,
      ),
    )
    .orderBy(
      asc(journalEntries.date),
      asc(journalEntries.id),
      asc(journalLines.id),
    )
    .limit(50_001)
  return records.map((row): ExportRow => ({
    date: row.date,
    entryId: row.entryId,
    lineId: row.lineId,
    description: row.description,
    code: row.code,
    account: row.account,
    category: row.kind,
    side: row.side,
    amountCents: String(row.amountCents),
    type: row.type ?? 'journal',
    status: 'posted',
  }))
}

function makeCsv(rows: ExportRow[]) {
  const header = [
    'Data',
    'Lançamento',
    'Linha',
    'Descrição',
    'Tipo',
    'Conta',
    'Categoria',
    'Lado',
    'Valor (EUR)',
    'Estado',
  ]
  const lines = [
    header,
    ...rows.map((row) => [
      row.date,
      row.entryId,
      row.lineId,
      row.description,
      row.type,
      `${row.code} · ${row.account}`,
      row.category,
      row.side === 'debit' ? 'Débito' : 'Crédito',
      amount(row.amountCents),
      row.status,
    ]),
  ]
  return Buffer.from(
    `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`,
    'utf8',
  )
}

async function makePdf(rows: ExportRow[], input: ExportRequest) {
  const [organization] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
  const doc = new PDFDocument({ margin: 42, size: 'A4' })
  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  doc.fontSize(18).text(`Relatório financeiro — ${organization.name}`)
  doc.fontSize(10).text(`Período: ${input.from} a ${input.to}`)
  doc.text(`Linhas contabilísticas: ${rows.length}`)
  if (rows.length === 0) doc.moveDown().text('Sem lançamentos no período.')
  const totals = new Map<string, { debit: bigint; credit: bigint }>()
  for (const row of rows) {
    const key = `${row.code} · ${row.account}`
    const current = totals.get(key) ?? { debit: BigInt(0), credit: BigInt(0) }
    current[row.side] += BigInt(row.amountCents)
    totals.set(key, current)
  }
  doc.moveDown().fontSize(13).text('Totais por conta')
  doc.fontSize(9)
  for (const [account, total] of totals)
    doc.text(
      `${account}: débito ${amount(String(total.debit))} € · crédito ${amount(String(total.credit))} €`,
    )
  doc.moveDown().fontSize(13).text('Razão')
  doc.fontSize(8)
  for (const row of rows)
    doc.text(
      `${row.date}  ${row.description}  ${row.code}  ${row.side === 'debit' ? 'D' : 'C'} ${amount(row.amountCents)} €`,
      { lineBreak: true },
    )
  doc.end()
  return result
}

export async function exportReport(
  input: ExportRequest,
): Promise<{ body: Uint8Array; contentType: string; filename: string }> {
  await requireMember(input.actorId, input.organizationId, [
    'owner',
    'admin',
    'editor',
    'reader',
  ])
  assertReportPeriod(input.from, input.to, input.accountId)
  if (input.format !== 'csv' && input.format !== 'pdf')
    throw new InvalidInputError()
  const rows = await queryExportRows(input)
  if (rows.length > 50_000) throw new InvalidInputError()
  const name = `personal-cfo-${input.from}-${input.to}.${input.format}`
  if (input.format === 'csv')
    return {
      body: makeCsv(rows),
      contentType: 'text/csv; charset=utf-8',
      filename: name,
    }
  return {
    body: await makePdf(rows, input),
    contentType: 'application/pdf',
    filename: name,
  }
}
