import type { Prisma } from '@prisma/client'
import { prisma, type Tx } from './prisma'

export async function beginIdempotency(tx: Tx, userId: string, scope: string, key: string | undefined): Promise<string | null> {
  if (!key) return null
  const full = `${scope}:${userId}:${key}`
  await tx.idempotencyKey.create({ data: { key: full, userId, response: { pending: true } } })
  return full
}

export async function finishIdempotency(tx: Tx, key: string | null, response: unknown): Promise<void> {
  if (!key) return
  await tx.idempotencyKey.update({
    where: { key },
    data: { response: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue },
  })
}

export async function savedIdempotent(userId: string, scope: string, key: string | undefined): Promise<unknown | null> {
  if (!key) return null
  const row = await prisma.idempotencyKey.findUnique({ where: { key: `${scope}:${userId}:${key}` } })
  if (!row || (row.response as { pending?: boolean }).pending) return null
  return row.response
}
