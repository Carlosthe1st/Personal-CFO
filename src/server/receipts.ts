import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { auditEvents, movements, receiptFiles } from '../db/schema'
import {
  ForbiddenError,
  InvalidInputError,
  PayloadTooLargeError,
  requireMember,
  uuidPattern,
} from './authorization'

export type ReceiptIdentity = {
  organizationId: string
  actorId: string
  movementId: string
}
export type ReceiptStorage = {
  upload(key: string, body: Uint8Array, mime: string): Promise<void>
  download(key: string): Promise<Uint8Array>
  remove(key: string): Promise<void>
}

const bucket = 'movement-receipts'
function storageUrl(key: string, authenticated = false) {
  const base = process.env.SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !secret) throw new Error('Receipt storage is not configured')
  return {
    url: `${base.replace(/\/$/, '')}/storage/v1/object/${authenticated ? 'authenticated/' : ''}${bucket}/${key}`,
    headers: { apikey: secret, authorization: `Bearer ${secret}` },
  }
}
export const receiptStorage: ReceiptStorage = {
  async upload(key, body, mime) {
    const target = storageUrl(key)
    const response = await fetch(target.url, {
      method: 'POST',
      headers: { ...target.headers, 'content-type': mime, 'x-upsert': 'false' },
      body: Buffer.from(body),
    })
    if (!response.ok) throw new Error('Receipt upload failed')
  },
  async download(key) {
    const target = storageUrl(key, true)
    const response = await fetch(target.url, {
      headers: target.headers,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Receipt download failed')
    return new Uint8Array(await response.arrayBuffer())
  },
  async remove(key) {
    const target = storageUrl(key)
    const response = await fetch(target.url, {
      method: 'DELETE',
      headers: target.headers,
    })
    if (!response.ok) throw new Error('Receipt cleanup failed')
  },
}

async function authorize(
  identity: ReceiptIdentity,
  roles: ('owner' | 'admin' | 'editor' | 'reader')[],
) {
  await requireMember(identity.actorId, identity.organizationId, roles)
  if (!uuidPattern.test(identity.movementId)) throw new InvalidInputError()
  const [movement] = await getDb()
    .select({ id: movements.id })
    .from(movements)
    .where(
      and(
        eq(movements.organizationId, identity.organizationId),
        eq(movements.id, identity.movementId),
      ),
    )
  if (!movement) throw new ForbiddenError()
}

function safeMetadata(row: typeof receiptFiles.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.createdAt,
  }
}

export async function listReceipts(identity: ReceiptIdentity) {
  await authorize(identity, ['owner', 'admin', 'editor', 'reader'])
  const rows = await getDb()
    .select()
    .from(receiptFiles)
    .where(
      and(
        eq(receiptFiles.organizationId, identity.organizationId),
        eq(receiptFiles.movementId, identity.movementId),
        isNull(receiptFiles.detachedAt),
      ),
    )
    .orderBy(asc(receiptFiles.createdAt))
  return rows.map(safeMetadata)
}

function detectedMime(bytes: Uint8Array) {
  if (
    bytes.length >= 5 &&
    [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte)
  )
    return 'application/pdf'
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  )
    return 'image/png'
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'image/jpeg'
  return null
}

export async function uploadReceipt(
  identity: ReceiptIdentity,
  file: File,
  storage: ReceiptStorage = receiptStorage,
) {
  await authorize(identity, ['owner', 'admin', 'editor'])
  if (file.size > 5_000_000) throw new PayloadTooLargeError()
  if (!file.size || file.name.length > 255 || !file.name.trim())
    throw new InvalidInputError()
  const body = new Uint8Array(await file.arrayBuffer())
  const mime = detectedMime(body)
  if (!mime || mime !== file.type) throw new InvalidInputError()
  const key = `${identity.organizationId}/${randomUUID()}`
  await storage.upload(key, body, mime)
  try {
    const row = await getDb().transaction(async (tx) => {
      const [movement] = await tx
        .select({ id: movements.id })
        .from(movements)
        .where(
          and(
            eq(movements.organizationId, identity.organizationId),
            eq(movements.id, identity.movementId),
          ),
        )
        .for('update')
      if (!movement) throw new ForbiddenError()
      const active = await tx
        .select({ id: receiptFiles.id })
        .from(receiptFiles)
        .where(
          and(
            eq(receiptFiles.organizationId, identity.organizationId),
            eq(receiptFiles.movementId, identity.movementId),
            isNull(receiptFiles.detachedAt),
          ),
        )
      if (active.length >= 5) throw new InvalidInputError()
      const [saved] = await tx
        .insert(receiptFiles)
        .values({
          organizationId: identity.organizationId,
          movementId: identity.movementId,
          actorId: identity.actorId,
          objectKey: key,
          name: file.name,
          mime,
          size: file.size,
          sha256: createHash('sha256').update(body).digest('hex'),
        })
        .returning()
      return saved
    })
    return safeMetadata(row)
  } catch (error) {
    await storage.remove(key).catch(() => undefined)
    throw error
  }
}

export async function downloadReceipt(
  identity: ReceiptIdentity,
  receiptId: string,
  storage: ReceiptStorage = receiptStorage,
) {
  await authorize(identity, ['owner', 'admin', 'editor', 'reader'])
  if (!uuidPattern.test(receiptId)) throw new InvalidInputError()
  const [row] = await getDb()
    .select()
    .from(receiptFiles)
    .where(
      and(
        eq(receiptFiles.id, receiptId),
        eq(receiptFiles.organizationId, identity.organizationId),
        eq(receiptFiles.movementId, identity.movementId),
        isNull(receiptFiles.detachedAt),
      ),
    )
  if (!row) throw new ForbiddenError()
  return { ...safeMetadata(row), body: await storage.download(row.objectKey) }
}

export async function detachReceipt(
  identity: ReceiptIdentity,
  receiptId: string,
) {
  await authorize(identity, ['owner', 'admin'])
  if (!uuidPattern.test(receiptId)) throw new InvalidInputError()
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(receiptFiles)
      .set({ detachedAt: new Date() })
      .where(
        and(
          eq(receiptFiles.id, receiptId),
          eq(receiptFiles.organizationId, identity.organizationId),
          eq(receiptFiles.movementId, identity.movementId),
          isNull(receiptFiles.detachedAt),
        ),
      )
      .returning()
    if (!row) throw new ForbiddenError()
    await tx
      .insert(auditEvents)
      .values({
        organizationId: identity.organizationId,
        actorId: identity.actorId,
        action: 'receipt_detached',
        data: { movementId: identity.movementId, receiptId },
      })
    return { id: receiptId }
  })
}
