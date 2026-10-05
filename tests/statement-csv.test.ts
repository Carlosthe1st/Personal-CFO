import { expect, it } from 'vitest'
import { parseStatementCsv } from '../src/lib/statement-csv'

it('maps Portuguese bank CSV with quoted separators into exact signed cents', () => {
  expect(
    parseStatementCsv(
      '\ufeffData;Texto;Valor\r\n04/10/2026;"Loja; Centro";-1.234,56\r\n05/10/2026;"Nota ""dupla""";0,10',
      { delimiter: ';', decimal: ',', date: 0, description: 1, amount: 2 },
    ),
  ).toEqual([
    { date: '2026-10-04', description: 'Loja; Centro', amountCents: -123456 },
    { date: '2026-10-05', description: 'Nota "dupla"', amountCents: 10 },
  ])
})
it('rejects impossible dates, ambiguous decimal values and broken quoting', () => {
  const mapping = {
    delimiter: ';' as const,
    decimal: ',' as const,
    date: 0,
    description: 1,
    amount: 2,
  }
  expect(() =>
    parseStatementCsv('date;text;amount\n31/02/2026;x;1,00', mapping),
  ).toThrow(/linha 2/i)
  expect(() =>
    parseStatementCsv('date;text;amount\n01/02/2026;x;1,234', mapping),
  ).toThrow(/linha 2/i)
  expect(() =>
    parseStatementCsv('date;text;amount\n01/02/2026;"x;1,00', mapping),
  ).toThrow()
})
