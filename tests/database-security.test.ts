import { afterEach, expect, it, vi } from 'vitest'
import { X509Certificate } from 'node:crypto'
import { Client } from 'pg'
import { getDb } from '../src/db/client'

afterEach(() => vi.unstubAllEnvs())

it('rejects remote database connections without verified TLS', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@pooler.example.com:6543/postgres')
  expect(() => getDb()).toThrow('Verified TLS required')
})

it('trusts the Supabase root CA while verifying the pooler hostname', () => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-full',
  )
  const client = new Client(getDb().$client.options)
  const ssl = Reflect.get(Reflect.get(client, 'connectionParameters'), 'ssl')

  expect(ssl.rejectUnauthorized).toBe(true)
  expect(new X509Certificate(ssl.ca).subject).toContain('Supabase Root 2021 CA')
  expect(ssl.checkServerIdentity).toBeUndefined()
})
