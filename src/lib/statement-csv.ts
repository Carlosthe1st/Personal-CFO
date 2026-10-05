export type StatementRow = {
  date: string
  description: string
  amountCents: number
}
export type CsvMapping = {
  delimiter: ',' | ';'
  decimal: ',' | '.'
  date: number
  description: number
  amount: number
}

export function readCsv(text: string, delimiter: ',' | ';') {
  if (text.length > 1_000_000) throw new Error('O CSV excede o limite de 1 MB.')
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false
  const finish = () => {
    row.push(field.trim())
    if (row.some(Boolean)) rows.push(row)
    row = []
    field = ''
    closed = false
    if (rows.length > 501)
      throw new Error('Importa no máximo 500 linhas de cada vez.')
  }
  const source = text.replace(/^\ufeff/, '')
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index++
      } else if (character === '"') {
        quoted = false
        closed = true
      } else field += character
    } else if (character === delimiter) {
      row.push(field.trim())
      field = ''
      closed = false
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index++
      finish()
    } else if (character === '"' && !field && !closed) quoted = true
    else if (character === '"' || (closed && character.trim()))
      throw new Error('Aspas inválidas no CSV.')
    else if (!closed) field += character
  }
  if (quoted) throw new Error('Aspas por fechar no CSV.')
  if (field || row.length) finish()
  return rows
}
export function parseStatementCsv(
  text: string,
  mapping: CsvMapping,
): StatementRow[] {
  const rows = readCsv(text, mapping.delimiter)
  if (rows.length < 2)
    throw new Error('O CSV precisa de cabeçalho e pelo menos uma linha.')
  const indices = [mapping.date, mapping.description, mapping.amount]
  if (
    new Set(indices).size !== 3 ||
    indices.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= rows[0].length,
    )
  )
    throw new Error(
      'Seleciona colunas diferentes para data, descrição e valor.',
    )
  return rows.slice(1).map((fields, index) => {
    const fail = () =>
      new Error(`Confirma a data, descrição e valor na linha ${index + 2}.`)
    const rawDate = fields[mapping.date] ?? ''
    const local = rawDate.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
    const date = local ? `${local[3]}-${local[2]}-${local[1]}` : rawDate
    const parsed = new Date(`${date}T00:00:00Z`)
    const description = fields[mapping.description]?.trim()
    const rawAmount = (fields[mapping.amount] ?? '').replace(/[\s\u00a0]/g, '')
    const pattern =
      mapping.decimal === ','
        ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
        : /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      !description ||
      description.length > 500 ||
      !pattern.test(rawAmount)
    )
      throw fail()
    const normalized =
      mapping.decimal === ','
        ? rawAmount.replaceAll('.', '').replace(',', '.')
        : rawAmount.replaceAll(',', '')
    const [whole, fraction = ''] = normalized.replace('-', '').split('.')
    const amount =
      (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))) *
      BigInt(normalized.startsWith('-') ? -1 : 1)
    if (
      amount === BigInt(0) ||
      amount > BigInt(Number.MAX_SAFE_INTEGER) ||
      amount < -BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw fail()
    return { date, description, amountCents: Number(amount) }
  })
}
