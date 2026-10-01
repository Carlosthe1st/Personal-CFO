import type { Organization, Transaction } from '../domain/models'
import { portugalDate } from '../lib/date'

export const organizations: Organization[] = [
  {
    id: 'atelier',
    name: 'Atelier Norte',
    country: 'PT',
    currency: 'EUR',
    fiscalYear: 2026,
    openingBalance: 15160,
    createdAt: '2026-01-01T09:00:00.000Z',
  },
  {
    id: 'associacao',
    name: 'Associação Horizonte',
    country: 'PT',
    currency: 'EUR',
    fiscalYear: 2026,
    openingBalance: 8200,
    createdAt: '2026-01-01T09:00:00.000Z',
  },
]

export function createDemoTransactions(now: Date): Transaction[] {
  const today = portugalDate(now)
  const yearMonth = today.slice(0, 7)
  const currentDay = Number(today.slice(-2))
  const date = (day: number) =>
    `${yearMonth}-${String(Math.min(day, currentDay)).padStart(2, '0')}`
  const make = (
    id: string,
    organizationId: string,
    type: Transaction['type'],
    description: string,
    amount: number,
    day: number,
    category: string,
    accountingStatus: Transaction['accountingStatus'] = 'confirmed',
  ): Transaction => ({
    id,
    organizationId,
    type,
    description,
    amount,
    currency: 'EUR',
    date: date(day),
    category,
    source: 'manual',
    taxStatus: 'needs_review',
    accountingStatus,
    confidence: 1,
    createdAt: `${date(day)}T12:00:00.000Z`,
    updatedAt: `${date(day)}T12:00:00.000Z`,
  })
  return [
    make(
      'demo-1',
      'atelier',
      'income',
      'Pagamento de projeto · Studio Lume',
      12800,
      4,
      'Clientes',
    ),
    make(
      'demo-2',
      'atelier',
      'expense',
      'Renda do espaço de trabalho',
      4100,
      6,
      'Instalações',
    ),
    make(
      'demo-3',
      'atelier',
      'expense',
      'Serviços e fornecedores',
      2840,
      10,
      'Fornecedores',
    ),
    make(
      'demo-4',
      'atelier',
      'expense',
      'Equipa e colaboradores',
      1900,
      14,
      'Equipa',
    ),
    make(
      'demo-5',
      'atelier',
      'expense',
      'Software e ferramentas',
      89,
      18,
      'Software',
    ),
    make(
      'demo-6',
      'atelier',
      'asset_purchase',
      'Equipamento informático',
      320,
      22,
      'Equipamento',
      'needs_review',
    ),
    make(
      'demo-7',
      'atelier',
      'expense',
      'Combustível para deslocação',
      180,
      24,
      'Deslocações',
      'needs_review',
    ),
    make(
      'demo-8',
      'atelier',
      'expense',
      'Material de escritório',
      167,
      26,
      'Outros',
      'needs_review',
    ),
    make(
      'demo-9',
      'associacao',
      'income',
      'Donativo mensal',
      2400,
      5,
      'Donativos',
    ),
    make(
      'demo-10',
      'associacao',
      'expense',
      'Renda da sede',
      850,
      8,
      'Instalações',
    ),
  ]
}
