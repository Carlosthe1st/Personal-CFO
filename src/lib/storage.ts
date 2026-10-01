import type { Transaction } from '../domain/models'

export const STORAGE_KEY = 'personal-cfo:v1'
export interface StoredData {
  version: 1
  transactions: Transaction[]
}

function isTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.organizationId === 'string' &&
    typeof item.description === 'string' &&
    typeof item.amount === 'number' &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    typeof item.date === 'string' &&
    typeof item.category === 'string' &&
    typeof item.type === 'string' &&
    typeof item.accountingStatus === 'string'
  )
}

export function decodeStoredData(raw: string): StoredData | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    const record = data as Record<string, unknown>
    if (
      record.version !== 1 ||
      !Array.isArray(record.transactions) ||
      !record.transactions.every(isTransaction)
    )
      return null
    return { version: 1, transactions: record.transactions }
  } catch {
    return null
  }
}

export function loadTransactions(fallback: Transaction[]): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (decodeStoredData(raw)?.transactions ?? fallback) : fallback
  } catch {
    return fallback
  }
}

export function saveTransactions(transactions: Transaction[]): boolean {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, transactions } satisfies StoredData),
    )
    return true
  } catch {
    return false
  }
}
