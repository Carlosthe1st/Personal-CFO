import type { Transaction } from '../domain/models'

export function needsUserReview(transaction: Transaction): boolean {
  return (
    !transaction.acknowledgedAt &&
    (transaction.accountingStatus === 'needs_review' ||
      transaction.accountingStatus === 'suggested')
  )
}

export function acknowledgeTransaction(
  transaction: Transaction,
  now: Date,
): Transaction {
  const timestamp = now.toISOString()
  return { ...transaction, acknowledgedAt: timestamp, updatedAt: timestamp }
}
