import { describe, expect, it } from 'vitest'
import { acknowledgeTransaction, needsUserReview } from '../src/lib/review'
import type { Transaction } from '../src/domain/models'

const transaction: Transaction = {
  id: 'one',
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
}

describe('acknowledgeTransaction', () => {
  it('records user acknowledgement while keeping accounting review pending', () => {
    const seen = acknowledgeTransaction(
      transaction,
      new Date('2026-09-14T10:00:00.000Z'),
    )
    expect(seen).toMatchObject({
      acknowledgedAt: '2026-09-14T10:00:00.000Z',
      accountingStatus: 'needs_review',
      taxStatus: 'needs_review',
    })
    expect(needsUserReview(seen)).toBe(false)
    expect(needsUserReview(transaction)).toBe(true)
  })
})
