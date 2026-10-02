import { afterEach, expect, it, vi } from 'vitest'
import { getDb } from '../src/db/client'

afterEach(() => vi.unstubAllEnvs())

it('rejects remote database connections without verified TLS', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@pooler.example.com:6543/postgres')
  expect(() => getDb()).toThrow('Verified TLS required')
})
