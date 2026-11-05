import type { Tx } from './prisma'

export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 5): Promise<string> {
  await tx.sequenceCounter.upsert({ where: { key }, create: { key, value: 0 }, update: {} })
  const row = await tx.sequenceCounter.update({ where: { key }, data: { value: { increment: 1 } } })
  return `${prefix}-${String(row.value).padStart(pad, '0')}`
}
