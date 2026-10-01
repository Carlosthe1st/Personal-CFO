import { describe, expect, it } from 'vitest'
import { interpretMessage } from '../src/lib/interpret'

describe('interpretMessage', () => {
  it.each([
    'Paguei -180 €',
    'Paguei € -180',
    'Paguei 1.2.3 €',
    'Paguei 12,345 €',
  ])(
    'asks for clarification instead of changing the amount in %s',
    (message) => {
      expect(
        interpretMessage(message, 'org-a', new Date('2026-09-30T12:00:00Z'))
          .kind,
      ).toBe('question')
    },
  )

  it.each([
    ['Paguei 1.250,50 €', 1250.5],
    ['Paguei € 1,250.50', 1250.5],
    ['Paguei 12,50 euros', 12.5],
  ])('preserves the amount in %s', (message, amount) => {
    const result = interpretMessage(
      message,
      'org-a',
      new Date('2026-09-30T12:00:00Z'),
    )
    expect(result.kind).toBe('proposal')
    if (result.kind === 'proposal')
      expect(result.transaction.amount).toBe(amount)
  })

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

  it.each(['Tenho 500 €', 'Transferi 100 € entre contas', 'Dívida de 300 €'])(
    'asks for clarification when direction is unclear: %s',
    (message) => {
      const result = interpretMessage(
        message,
        'org-a',
        new Date('2026-09-30T12:00:00Z'),
      )
      expect(result.kind).toBe('question')
      expect(result.reply).toContain('entrada ou saída')
    },
  )

  it.each(['Ainda não paguei 100 €', 'Não recebi 100 €'])(
    'does not record a negated event: %s',
    (message) => {
      const result = interpretMessage(
        message,
        'org-a',
        new Date('2026-09-30T12:00:00Z'),
      )
      expect(result.kind).toBe('question')
    },
  )

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
