import { redactSecrets } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import type { Actor } from './actor'
import type { Effects, Tx } from './prisma'

export async function audit(
  tx: Tx,
  actor: Actor | null,
  entry: {
    action: string
    module: string
    recordId?: string
    oldValues?: unknown
    newValues?: unknown
    reason?: string
    result?: 'success' | 'failure'
    discordId?: string
    actorName?: string
    actorId?: string
    ip?: string
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor?.userId ?? entry.actorId,
      actorName: actor?.name ?? entry.actorName ?? '',
      discordId: actor?.discordId ?? entry.discordId ?? '',
      action: entry.action,
      module: entry.module,
      recordId: entry.recordId ?? '',
      oldValues: entry.oldValues === undefined ? undefined : (redactSecrets(entry.oldValues) as Prisma.InputJsonValue),
      newValues: entry.newValues === undefined ? undefined : (redactSecrets(entry.newValues) as Prisma.InputJsonValue),
      reason: entry.reason ?? '',
      result: entry.result ?? 'success',
      ip: entry.ip ?? actor?.ip ?? '',
    },
  })
}

export async function changed(
  tx: Tx,
  effects: Effects,
  event: { module: string; action: string; recordId: string; permission: string; employeeId?: string | null },
): Promise<void> {
  await tx.changeEvent.create({
    data: {
      module: event.module,
      action: event.action,
      recordId: event.recordId,
      permission: event.permission,
      employeeId: event.employeeId ?? '',
    },
  })
  effects.change({
    module: event.module,
    action: event.action,
    recordId: event.recordId,
    permission: event.permission,
    employeeId: event.employeeId ?? undefined,
  })
}
