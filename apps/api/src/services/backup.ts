import { sha256 } from '@mdt/shared'
import { Prisma } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { HttpError } from '../lib/http'
import { prisma, type Tx } from '../lib/prisma'
import { createSession } from '../lib/session'
import { ensureCatalog, ensureCode } from '../bootstrap'

export const BACKUP_FORMAT = 'mdt-backup-v1'

interface BackupFile {
  format: string
  createdAt: string
  checksum: string
  tables: Record<string, unknown[]>
}

const TABLE_KEYS = [
  'permission',
  'role',
  'rolePermission',
  'rank',
  'employee',
  'citizen',
  'user',
  'userRole',
  'inventoryItem',
  'stockMovement',
  'equipmentRequest',
  'requestEvent',
  'equipmentIssue',
  'equipmentMovement',
  'lossRecord',
  'lossAction',
  'law',
  'lawRevision',
  'wantedNotice',
  'wantedCharge',
  'wantedEvent',
  'fine',
  'fineCharge',
  'fineEvent',
  'seizure',
  'seizureItem',
  'seizureEvent',
  'financeCategory',
  'financeEntry',
  'employeeHistory',
  'notification',
  'auditLog',
  'outboxEvent',
  'outboxDelivery',
  'changeEvent',
  'appSetting',
  'sequenceCounter',
  'systemError',
] as const

export function assertBackup(value: unknown): asserts value is BackupFile {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'BACKUP', 'Файл архива не распознан.')
  const file = value as BackupFile
  if (file.format !== BACKUP_FORMAT) throw new HttpError(400, 'BACKUP', 'Неподдерживаемая версия архива.')
  if (!file.checksum || !file.tables || typeof file.tables !== 'object') {
    throw new HttpError(400, 'BACKUP', 'В архиве нет данных.')
  }
}

export async function exportBackup() {
  const tables: Record<string, unknown[]> = {
    permission: await prisma.permission.findMany(),
    role: await prisma.role.findMany(),
    rolePermission: await prisma.rolePermission.findMany(),
    rank: await prisma.rank.findMany(),
    employee: await prisma.employee.findMany(),
    citizen: await prisma.citizen.findMany(),
    user: await prisma.user.findMany(),
    userRole: await prisma.userRole.findMany(),
    inventoryItem: await prisma.inventoryItem.findMany(),
    stockMovement: await prisma.stockMovement.findMany(),
    equipmentRequest: await prisma.equipmentRequest.findMany(),
    requestEvent: await prisma.requestEvent.findMany(),
    equipmentIssue: await prisma.equipmentIssue.findMany(),
    equipmentMovement: await prisma.equipmentMovement.findMany(),
    lossRecord: await prisma.lossRecord.findMany(),
    lossAction: await prisma.lossAction.findMany(),
    law: await prisma.law.findMany(),
    lawRevision: await prisma.lawRevision.findMany(),
    wantedNotice: await prisma.wantedNotice.findMany(),
    wantedCharge: await prisma.wantedCharge.findMany(),
    wantedEvent: await prisma.wantedEvent.findMany(),
    fine: await prisma.fine.findMany(),
    fineCharge: await prisma.fineCharge.findMany(),
    fineEvent: await prisma.fineEvent.findMany(),
    seizure: await prisma.seizure.findMany(),
    seizureItem: await prisma.seizureItem.findMany(),
    seizureEvent: await prisma.seizureEvent.findMany(),
    financeCategory: await prisma.financeCategory.findMany(),
    financeEntry: await prisma.financeEntry.findMany(),
    employeeHistory: await prisma.employeeHistory.findMany(),
    notification: await prisma.notification.findMany(),
    auditLog: await prisma.auditLog.findMany(),
    outboxEvent: await prisma.outboxEvent.findMany(),
    outboxDelivery: await prisma.outboxDelivery.findMany(),
    changeEvent: await prisma.changeEvent.findMany(),
    appSetting: await prisma.appSetting.findMany(),
    sequenceCounter: await prisma.sequenceCounter.findMany(),
    systemError: await prisma.systemError.findMany(),
  }
  return {
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    checksum: sha256(JSON.stringify(tables)),
    tables,
  }
}

export async function restoreBackup(actor: Actor, value: unknown, userAgent: string): Promise<{ token: string }> {
  assertBackup(value)
  if (sha256(JSON.stringify(value.tables)) !== value.checksum) {
    throw new HttpError(400, 'BACKUP', 'Архив повреждён или изменён. Восстановление остановлено.')
  }
  const priorAudit = await prisma.auditLog.findMany()
  const actorRow = await prisma.user.findUnique({ where: { id: actor.userId } })
  if (!actorRow) throw new HttpError(401, 'UNAUTHORIZED', 'Сессия недействительна.')
  await prisma.$transaction(async (tx) => {
    await wipe(tx)
    for (const key of TABLE_KEYS) await insert(tx, key, value.tables[key] ?? [])
    const restored = new Set((value.tables.auditLog ?? []).map((row) => String((row as { id: string }).id)))
    const missing = priorAudit.filter((row) => !restored.has(row.id))
    if (missing.length) {
      await tx.auditLog.createMany({
        data: missing.map((row) => ({
          ...row,
          oldValues: row.oldValues === null ? Prisma.JsonNull : (row.oldValues as Prisma.InputJsonValue),
          newValues: row.newValues === null ? Prisma.JsonNull : (row.newValues as Prisma.InputJsonValue),
        })),
      })
    }
    const existingUser = await tx.user.findUnique({ where: { discordId: actorRow.discordId } })
    if (!existingUser) {
      await tx.user.create({
        data: {
          id: actorRow.id,
          discordId: actorRow.discordId,
          username: actorRow.username,
          globalName: actorRow.globalName,
          avatar: actorRow.avatar,
          accessGranted: true,
          blocked: false,
        },
      })
    }
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"ChangeEvent"', 'id'), COALESCE((SELECT MAX(id) FROM "ChangeEvent"), 1), true)`,
    )
  }, { timeout: 120_000 })
  await ensureCatalog()
  await ensureCode()
  const token = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { discordId: actorRow.discordId } })
    if (!user) throw new HttpError(500, 'RESTORE', 'Не удалось сохранить учётную запись администратора.')
    await tx.user.update({ where: { id: user.id }, data: { accessGranted: true, blocked: false } })
    const role = await tx.role.findUnique({ where: { key: 'administrator' } })
    if (!role) throw new HttpError(500, 'RESTORE', 'Роль администратора не восстановлена.')
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorName: actor.name,
        discordId: actor.discordId,
        action: 'backup.restore',
        module: 'admin',
        reason: 'Восстановление архива',
        newValues: { format: BACKUP_FORMAT, createdAt: value.createdAt },
        ip: actor.ip,
      },
    })
    return createSession(tx, user.id, userAgent)
  })
  return { token }
}

async function wipe(tx: Tx): Promise<void> {
  await tx.outboxDelivery.deleteMany()
  await tx.outboxEvent.deleteMany()
  await tx.notification.deleteMany()
  await tx.session.deleteMany()
  await tx.oauthAttempt.deleteMany()
  await tx.idempotencyKey.deleteMany()
  await tx.fineEvent.deleteMany()
  await tx.fineCharge.deleteMany()
  await tx.fine.deleteMany()
  await tx.wantedEvent.deleteMany()
  await tx.wantedCharge.deleteMany()
  await tx.wantedNotice.deleteMany()
  await tx.lawRevision.deleteMany()
  await tx.law.deleteMany()
  await tx.seizureEvent.deleteMany()
  await tx.seizureItem.deleteMany()
  await tx.seizure.deleteMany()
  await tx.citizen.deleteMany()
  await tx.lossAction.deleteMany()
  await tx.lossRecord.deleteMany()
  await tx.equipmentMovement.deleteMany()
  await tx.equipmentIssue.deleteMany()
  await tx.requestEvent.deleteMany()
  await tx.equipmentRequest.deleteMany()
  await tx.stockMovement.deleteMany()
  await tx.inventoryItem.deleteMany()
  await tx.financeEntry.deleteMany()
  await tx.financeCategory.deleteMany()
  await tx.employeeHistory.deleteMany()
  await tx.userRole.deleteMany()
  await tx.user.updateMany({ data: { employeeId: null } })
  await tx.employee.deleteMany()
  await tx.user.deleteMany()
  await tx.rolePermission.deleteMany()
  await tx.role.deleteMany()
  await tx.permission.deleteMany()
  await tx.rank.deleteMany()
  await tx.auditLog.deleteMany()
  await tx.changeEvent.deleteMany()
  await tx.systemError.deleteMany()
  await tx.appSetting.deleteMany()
  await tx.sequenceCounter.deleteMany()
}

async function insert(tx: Tx, key: (typeof TABLE_KEYS)[number], rows: unknown[]): Promise<void> {
  if (!rows.length) return
  const data = rows as never
  const writers: Record<(typeof TABLE_KEYS)[number], () => Promise<unknown>> = {
    permission: () => tx.permission.createMany({ data }),
    role: () => tx.role.createMany({ data }),
    rolePermission: () => tx.rolePermission.createMany({ data }),
    rank: () => tx.rank.createMany({ data }),
    employee: () => tx.employee.createMany({ data }),
    citizen: () => tx.citizen.createMany({ data }),
    user: () => tx.user.createMany({ data }),
    userRole: () => tx.userRole.createMany({ data }),
    inventoryItem: () => tx.inventoryItem.createMany({ data }),
    stockMovement: () => tx.stockMovement.createMany({ data }),
    equipmentRequest: () => tx.equipmentRequest.createMany({ data }),
    requestEvent: () => tx.requestEvent.createMany({ data }),
    equipmentIssue: () => tx.equipmentIssue.createMany({ data }),
    equipmentMovement: () => tx.equipmentMovement.createMany({ data }),
    lossRecord: () => tx.lossRecord.createMany({ data }),
    lossAction: () => tx.lossAction.createMany({ data }),
    law: () => tx.law.createMany({ data }),
    lawRevision: () => tx.lawRevision.createMany({ data }),
    wantedNotice: () => tx.wantedNotice.createMany({ data }),
    wantedCharge: () => tx.wantedCharge.createMany({ data }),
    wantedEvent: () => tx.wantedEvent.createMany({ data }),
    fine: () => tx.fine.createMany({ data }),
    fineCharge: () => tx.fineCharge.createMany({ data }),
    fineEvent: () => tx.fineEvent.createMany({ data }),
    seizure: () => tx.seizure.createMany({ data }),
    seizureItem: () => tx.seizureItem.createMany({ data }),
    seizureEvent: () => tx.seizureEvent.createMany({ data }),
    financeCategory: () => tx.financeCategory.createMany({ data }),
    financeEntry: () => tx.financeEntry.createMany({ data }),
    employeeHistory: () => tx.employeeHistory.createMany({ data }),
    notification: () => tx.notification.createMany({ data }),
    auditLog: () => tx.auditLog.createMany({ data }),
    outboxEvent: () => tx.outboxEvent.createMany({ data }),
    outboxDelivery: () => tx.outboxDelivery.createMany({ data }),
    changeEvent: () => tx.changeEvent.createMany({ data }),
    appSetting: () => tx.appSetting.createMany({ data }),
    sequenceCounter: () => tx.sequenceCounter.createMany({ data }),
    systemError: () => tx.systemError.createMany({ data }),
  }
  await writers[key]()
}
