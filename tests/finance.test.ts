import { describe, expect, it } from 'vitest'
import { calculateOverview, formatEuro } from '../src/lib/finance'
import type { Transaction } from '../src/domain/models'

const transactions: Transaction[] = [
  {
    id: 'one',
    organizationId: 'org-a',
    type: 'income',
    description: 'Cliente',
    amount: 2500,
    currency: 'EUR',
    date: '2026-09-12',
    category: 'Clientes',
    source: 'manual',
    taxStatus: 'needs_review',
    accountingStatus: 'confirmed',
    confidence: 1,
    createdAt: '2026-09-12T12:00:00.000Z',
    updatedAt: '2026-09-12T12:00:00.000Z',
  },
  {
    id: 'two',
    organizationId: 'org-a',
    type: 'expense',
    description: 'Combustível',
    amount: 180,
    currency: 'EUR',
    date: '2026-09-13',
    category: 'Deslocações',
    source: 'manual',
    taxStatus: 'needs_review',
    accountingStatus: 'needs_review',
    confidence: 0.8,
    createdAt: '2026-09-13T12:00:00.000Z',
    updatedAt: '2026-09-13T12:00:00.000Z',
  },
  {
    id: 'three',
    organizationId: 'org-b',
    type: 'expense',
    description: 'Outra empresa',
    amount: 900,
    currency: 'EUR',
    date: '2026-09-13',
    category: 'Outros',
    source: 'manual',
    taxStatus: 'needs_review',
    accountingStatus: 'confirmed',
    confidence: 1,
    createdAt: '2026-09-13T12:00:00.000Z',
    updatedAt: '2026-09-13T12:00:00.000Z',
  },
]

describe('calculateOverview', () => {
  it('keeps cents visible in financial amounts', () => {
    expect(formatEuro(12.5).replace(/\s/g, ' ')).toBe('12,50 €')
    expect(formatEuro(0.01).replace(/\s/g, ' ')).toBe('0,01 €')
  })
  it('isolates organizations and totals current month income and expense', () => {
    const result = calculateOverview(
      transactions,
      'org-a',
      10000,
      new Date('2026-09-30T12:00:00Z'),
    )
    expect(result).toMatchObject({
      balance: 12320,
      income: 2500,
      expenses: 180,
      net: 2320,
      reviewCount: 1,
    })
  })

  it('starts the next month at midnight in Portugal', () => {
    const result = calculateOverview(
      transactions,
      'org-a',
      10000,
      new Date('2026-09-30T23:30:00Z'),
    )
    expect(result).toMatchObject({ income: 0, expenses: 0, net: 0 })
  })

  it('removes an acknowledged item from the user queue without confirming accounting', () => {
    const acknowledged = transactions.map((item) =>
      item.id === 'two'
        ? { ...item, acknowledgedAt: '2026-09-14T10:00:00.000Z' }
        : item,
    )
    const result = calculateOverview(
      acknowledged,
      'org-a',
      10000,
      new Date('2026-09-30T12:00:00Z'),
    )
    expect(result.reviewCount).toBe(0)
    expect(acknowledged[1].accountingStatus).toBe('needs_review')
  })
})
