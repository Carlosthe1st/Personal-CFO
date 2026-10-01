import { describe, expect, it } from 'vitest'
import { interpretMessage } from '../src/lib/interpret'

describe('interpretMessage', () => {
  it('suggests an expense without claiming fiscal certainty', () => {
    const result = interpretMessage(
      'Paguei 180 € de combustível',
      'org-a',
      new Date('2026-09-30T12:00:00Z'),
    )
    expect(result.kind).toBe('proposal')
    if (result.kind === 'proposal') {
      expect(result.transaction).toMatchObject({
        type: 'expense',
        amount: 180,
        category: 'Deslocações',
        organizationId: 'org-a',
        accountingStatus: 'suggested',
      })
      expect(result.reply).toContain('sugestão')
    }
  })

  it('recognizes a received payment as income', () => {
    const result = interpretMessage(
      'Recebi 2.500 € de um cliente',
      'org-a',
      new Date('2026-09-30T12:00:00Z'),
    )
    expect(result.kind).toBe('proposal')
    if (result.kind === 'proposal') expect(result.transaction.amount).toBe(2500)
    if (result.kind === 'proposal')
      expect(result.transaction.type).toBe('income')
  })

  it('does not create a transaction from a question', () => {
    expect(
      interpretMessage(
        'Quanto gastei este mês?',
        'org-a',
        new Date('2026-09-30T12:00:00Z'),
      ).kind,
    ).toBe('question')
  })

  it('uses the Portuguese calendar date near midnight', () => {
    const result = interpretMessage(
      'Paguei 10 € de software',
      'org-a',
      new Date('2026-09-30T23:30:00Z'),
    )
    expect(result.kind).toBe('proposal')
    if (result.kind === 'proposal')
      expect(result.transaction.date).toBe('2026-10-01')
  })
})
