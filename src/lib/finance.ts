import type { Transaction } from '../domain/models'
import { needsUserReview } from './review'
import { portugalDate } from './date'

export interface Overview {
  balance: number
  income: number
  expenses: number
  net: number
  reviewCount: number
  categoryTotals: { category: string; amount: number }[]
}

export function calculateOverview(
  transactions: Transaction[],
  organizationId: string,
  openingBalance: number,
  now: Date,
): Overview {
  const own = transactions.filter(
    (item) => item.organizationId === organizationId,
  )
  const month = portugalDate(now).slice(0, 7)
  const inMonth = own.filter((item) => item.date.slice(0, 7) === month)
  const signed = (item: Transaction) =>
    item.type === 'income'
      ? item.amount
      : item.type === 'expense' ||
          item.type === 'asset_purchase' ||
          item.type === 'tax'
        ? -item.amount
        : 0
  const income = inMonth
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0)
  const expenses = inMonth
    .filter((item) => signed(item) < 0)
    .reduce((sum, item) => sum + item.amount, 0)
  const categories = new Map<string, number>()
  for (const item of inMonth.filter((item) => signed(item) < 0))
    categories.set(
      item.category,
      (categories.get(item.category) ?? 0) + item.amount,
    )
  return {
    balance: openingBalance + own.reduce((sum, item) => sum + signed(item), 0),
    income,
    expenses,
    net: income - expenses,
    reviewCount: own.filter(needsUserReview).length,
    categoryTotals: [...categories]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  }
}

export const formatEuro = (amount: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
