import { describe, expect, it } from 'vitest'
import { decodeStoredData } from '../src/lib/storage'

describe('decodeStoredData', () => {
  it('rejects malformed persisted data', () => {
    expect(decodeStoredData('{bad json')).toBeNull()
    expect(
      decodeStoredData('{"version":1,"transactions":[{"amount":"wrong"}]}'),
    ).toBeNull()
  })
})
