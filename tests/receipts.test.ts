import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  prepareDatabase,
  resetDatabase,
  testSql,
} from './helpers/database'
import { createOrganization, listAccounts } from '../src/server/organizations'
import { createMovement } from '../src/server/movements'
import {
  downloadReceipt,
  listReceipts,
  uploadReceipt,
  type ReceiptStorage,
} from '../src/server/receipts'

describe.skipIf(!process.env.DATABASE_URL_TEST)('private receipts', () => {
  beforeAll(prepareDatabase)
  beforeEach(resetDatabase)
  afterAll(closeDatabase)

  const objects = new Map<string, Uint8Array>()
  const storage: ReceiptStorage = {
    async upload(key, data) {
      objects.set(key, data)
    },
    async download(key) {
      const data = objects.get(key)
      if (!data) throw new Error('missing')
      return data
    },
    async remove(key) {
      objects.delete(key)
    },
  }
  const pdf = () =>
    new File([new TextEncoder().encode('%PDF-1.7\nhello')], 'fatura.pdf', {
      type: 'application/pdf',
    })

  async function setup() {
    objects.clear()
    const [user] =
      await testSql`insert into users (email) values ('receipt@example.test') returning id`
    const org = await createOrganization(user.id, 'Receipts')
    const accounts = await listAccounts(org.id, user.id)
    const account = (code: string) =>
      accounts.find((item) => item.code === code)!.id
    const movement = await createMovement({
      organizationId: org.id,
      actorId: user.id,
      type: 'expense',
      date: '2026-10-05',
      description: 'Factura',
      amountCents: 100,
      financialAccountId: account('BANCO'),
      counterAccountId: account('DESPESA'),
      idempotencyKey: 'receipt-movement',
    })
    return {
      identity: {
        organizationId: org.id,
        actorId: user.id,
        movementId: movement.id,
      },
      user,
    }
  }

  it('uploads, lists and downloads through an authorized private storage boundary', async () => {
    const { identity } = await setup()
    const saved = await uploadReceipt(identity, pdf(), storage)
    expect(saved.name).toBe('fatura.pdf')
    expect(await listReceipts(identity)).toEqual([
      expect.objectContaining({ id: saved.id, name: 'fatura.pdf' }),
    ])
    const downloaded = await downloadReceipt(identity, saved.id, storage)
    expect(new TextDecoder().decode(downloaded.body)).toContain('%PDF-')
  })

  it('rejects cross-organization access, forged signatures and oversized files', async () => {
    const { identity, user } = await setup()
    const other = await createOrganization(user.id, 'Other')
    await expect(
      uploadReceipt({ ...identity, organizationId: other.id }, pdf(), storage),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      uploadReceipt(
        identity,
        new File(['MZbad'], 'bad.pdf', { type: 'application/pdf' }),
        storage,
      ),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      uploadReceipt(
        identity,
        new File([new Uint8Array(5_000_001)], 'large.pdf', {
          type: 'application/pdf',
        }),
        storage,
      ),
    ).rejects.toMatchObject({ status: 413 })
  })

  it('enforces five active files even with concurrent uploads', async () => {
    const { identity } = await setup()
    await Promise.all(
      Array.from({ length: 5 }, () => uploadReceipt(identity, pdf(), storage)),
    )
    expect(await listReceipts(identity)).toHaveLength(5)
    await expect(uploadReceipt(identity, pdf(), storage)).rejects.toMatchObject(
      { status: 400 },
    )
    expect(objects.size).toBe(5)
  })

  it('does not create metadata if storage fails', async () => {
    const { identity } = await setup()
    await expect(
      uploadReceipt(identity, pdf(), {
        ...storage,
        upload: async () => {
          throw new Error('offline')
        },
      }),
    ).rejects.toThrow('offline')
    expect(await listReceipts(identity)).toEqual([])
  })
})
