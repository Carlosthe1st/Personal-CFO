import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeStoredData,
  loadTransactions,
  saveTransactions,
  STORAGE_KEY,
} from '../src/lib/storage'
import { createDemoTransactions } from '../src/data/demo'

describe('decodeStoredData', () => {
  const transaction = createDemoTransactions(
    new Date('2026-09-30T12:00:00Z'),
  )[0]

  it('restores complete valid transaction data', () => {
    expect(
      decodeStoredData(
        JSON.stringify({ version: 1, transactions: [transaction] }),
      )?.transactions,
    ).toEqual([transaction])
  })

  it.each([
    { type: 'invalid' },
    { accountingStatus: 'invalid' },
    { taxStatus: 'invalid' },
    { source: 'invalid' },
    { currency: 'USD' },
    { confidence: 2 },
    { confidence: undefined },
    { date: '2026-02-30' },
    { createdAt: undefined },
    { updatedAt: 'not-a-date' },
    { acknowledgedAt: 'garbage' },
    { notes: 123 },
  ])('rejects invalid persisted transaction fields: %j', (invalid) => {
    expect(
      decodeStoredData(
        JSON.stringify({
          version: 1,
          transactions: [{ ...transaction, ...invalid }],
        }),
      ),
    ).toBeNull()
  })

  it('rejects malformed persisted data', () => {
    expect(decodeStoredData('{bad json')).toBeNull()
    expect(
      decodeStoredData('{"version":1,"transactions":[{"amount":"wrong"}]}'),
    ).toBeNull()
  })

  it('restores a valid acknowledgement timestamp', () => {
    const acknowledged = {
      ...transaction,
      acknowledgedAt: '2026-09-30T13:00:00.000Z',
    }
    expect(
      decodeStoredData(
        JSON.stringify({ version: 1, transactions: [acknowledged] }),
      )?.transactions,
    ).toEqual([acknowledged])
  })
})

describe('persisted data recovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not write when the current session has blocked persistence', () => {
    const entries = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    })
    expect(saveTransactions([], false)).toBe(false)
    expect(entries.size).toBe(0)
  })

  it('reports a failed write and preserves the previous saved snapshot', () => {
    const previous = JSON.stringify({ version: 1, transactions: [] })
    vi.stubGlobal('localStorage', {
      getItem: () => previous,
      setItem: () => {
        throw new Error('Quota exceeded')
      },
    })
    expect(
      saveTransactions(
        createDemoTransactions(new Date('2026-09-30T12:00:00Z')),
      ),
    ).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(previous)
  })

  it.each(['{broken json', '{"version":2,"transactions":[]}'])(
    'preserves unreadable stored data: %s',
    (raw) => {
      const entries = new Map([[STORAGE_KEY, raw]])
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
      })
      const loaded = loadTransactions(
        createDemoTransactions(new Date('2026-09-30T12:00:00Z')),
      )
      expect(loaded).toEqual({ transactions: [], canSave: false })
      expect(saveTransactions(loaded.transactions)).toBe(false)
      expect(entries.get(STORAGE_KEY)).toBe(raw)
    },
  )

  it('permits saving demo data only when no saved data exists', () => {
    const entries = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    })
    const fallback = createDemoTransactions(new Date('2026-09-30T12:00:00Z'))
    const loaded = loadTransactions(fallback)
    expect(loaded).toEqual({ transactions: fallback, canSave: true })
    expect(saveTransactions(loaded.transactions)).toBe(true)
    expect(decodeStoredData(entries.get(STORAGE_KEY)!)?.transactions).toEqual(
      fallback,
    )
  })
})
