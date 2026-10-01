import type { Transaction } from '../domain/models'

export const STORAGE_KEY = 'personal-cfo:v1'
export interface StoredData {
  version: 1
  transactions: Transaction[]
}

const transactionTypes = [
  'income',
  'expense',
  'transfer',
  'asset_purchase',
  'liability',
  'tax',
  'unknown',
]
const reviewStatuses = [
  'draft',
  'needs_review',
  'suggested',
  'confirmed',
  'accountant_reviewed',
]
const sources = ['manual', 'voice', 'document', 'bank', 'integration']

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
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
    isCalendarDate(item.date) &&
    typeof item.category === 'string' &&
    typeof item.type === 'string' &&
    transactionTypes.includes(item.type) &&
    typeof item.accountingStatus === 'string' &&
    reviewStatuses.includes(item.accountingStatus) &&
    typeof item.taxStatus === 'string' &&
    reviewStatuses.includes(item.taxStatus) &&
    typeof item.source === 'string' &&
    sources.includes(item.source) &&
    item.currency === 'EUR' &&
    typeof item.confidence === 'number' &&
    Number.isFinite(item.confidence) &&
    item.confidence >= 0 &&
    item.confidence <= 1 &&
    isTimestamp(item.createdAt) &&
    isTimestamp(item.updatedAt) &&
    (item.acknowledgedAt === undefined || isTimestamp(item.acknowledgedAt)) &&
    ['subcategory', 'counterparty', 'documentId', 'notes'].every(
      (key) => item[key] === undefined || typeof item[key] === 'string',
    )
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

export function loadTransactions(fallback: Transaction[]): {
  transactions: Transaction[]
  canSave: boolean
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { transactions: fallback, canSave: true }
    const decoded = decodeStoredData(raw)
    return decoded
      ? { transactions: decoded.transactions, canSave: true }
      : { transactions: [], canSave: false }
  } catch {
    return { transactions: [], canSave: false }
  }
}

export function saveTransactions(
  transactions: Transaction[],
  canSave = true,
): boolean {
  if (!canSave) return false
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing !== null && !decodeStoredData(existing)) return false
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, transactions } satisfies StoredData),
    )
    return true
  } catch {
    return false
  }
}
