import { Router } from 'express'
import {
  PERMISSIONS,
  SETTING_KEYS,
  backupRestoreSchema,
  pageSchema,
  rankSchema,
  roleWriteSchema,
  settingsPatchSchema,
  userGrantSchema,
  userRolesSchema,
} from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { HttpError, action } from '../lib/http'
import { audience, enqueueNotice } from '../lib/notify'
import { prisma, run } from '../lib/prisma'
import { clearSettingsCache, putSetting } from '../lib/settings'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requireAdmin, requirePermission } from '../middleware/auth'
import { onlineUserIds, publishBroadcast, publishNotification } from '../lib/realtime'
import { assertCanAssign, assertKeepsAdmin, loadRoles, revokeSessions, setRoles } from '../services/access'
import { exportBackup, restoreBackup } from '../services/backup'

export const adminRouter = Router()
export const ranksRouter = Router()

ranksRouter.get(
  '/',
  requirePermission(PERMISSIONS.personnelView),
  action(async (_req, res) => {
    const items = await prisma.rank.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    res.json({ items })
  }),
)

ranksRouter.post(
  '/',
  requirePermission(PERMISSIONS.personnelManage),
  action(async (req, res) => {
    const body = parseBody<{ name: string; sortOrder: number }>(rankSchema, req.body)
    const actor = actorOf(req)
    const rank = await run(async (tx, effects) => {
      const created = await tx.rank.create({ data: { name: body.name, sortOrder: body.sortOrder } })
      await audit(tx, actor, { action: 'settings.update', module: 'personnel', recordId: created.id, newValues: body })
      await changed(tx, effects, { module: 'personnel', action: 'rank.create', recordId: created.id, permission: PERMISSIONS.personnelView })
      return created
    })
    res.status(201).json(rank)
  }),
)

adminRouter.use(requireAdmin)

adminRouter.get(
  '/summary',
  action(async (_req, res) => {
    const [users, employees, issues, losses, seizures, laws, wanted, fines, requests, entries, errors] = await Promise.all([
      prisma.user.count(),
      prisma.employee.count(),
      prisma.equipmentIssue.count(),
      prisma.lossRecord.count(),
      prisma.seizure.count(),
      prisma.law.count(),
      prisma.wantedNotice.count(),
      prisma.fine.count(),
      prisma.equipmentRequest.count(),
      prisma.financeEntry.count(),
      prisma.systemError.count(),
    ])
    res.json({ users, employees, issues, losses, seizures, laws, wanted, fines, requests, entries, errors })
  }),
)

adminRouter.get(
  '/presence',
  action(async (_req, res) => {
    const online = new Set(onlineUserIds())
    const users = await prisma.user.findMany({
      include: {
        employee: true,
        roles: { include: { role: true } },
        sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { lastUsedAt: true } },
      },
    })
    const items = users
      .map((user) => {
        const lastSeen = user.sessions.reduce<Date | null>((latest, session) => {
          if (!latest || session.lastUsedAt > latest) return session.lastUsedAt
          return latest
        }, user.lastLoginAt)
        return {
          id: user.id,
          discordId: user.discordId,
          username: user.username,
          name: user.employee ? `${user.employee.lastName} ${user.employee.firstName}` : user.globalName || user.username,
          badgeNumber: user.employee?.badgeNumber ?? '',
          roles: user.roles.map((link) => link.role.name),
          blocked: user.blocked,
          accessGranted: user.accessGranted,
          online: online.has(user.id),
          activeSessions: user.sessions.length,
          lastSeenAt: lastSeen?.toISOString() ?? null,
        }
      })
      .sort((left, right) => Number(right.online) - Number(left.online) || left.name.localeCompare(right.name, 'ru'))
    res.json({ items, online: items.filter((item) => item.online).length })
  }),
)

adminRouter.post(
  '/broadcast',
  action(async (req, res) => {
    const actor = actorOf(req)
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
    if (message.length < 3 || message.length > 400) {
      throw new HttpError(400, 'VALIDATION', 'Напишите оповещение от 3 до 400 символов.')
    }
    const recipients = await prisma.user.findMany({ where: { accessGranted: true, blocked: false }, select: { id: true } })
    const notice = await run(async (tx) => {
      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map((user) => ({
            userId: user.id,
            title: 'Оповещение департамента',
            body: message,
            module: 'admin',
          })),
        })
      }
      await audit(tx, actor, {
        action: 'broadcast.send',
        module: 'admin',
        reason: message,
        newValues: { recipients: recipients.length },
      })
      return { message, actorName: actor.name, createdAt: new Date().toISOString() }
    })
    publishBroadcast(notice)
    for (const user of recipients) publishNotification(user.id)
    res.status(201).json(notice)
  }),
)

adminRouter.get(
  '/users',
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string }>(pageSchema, req.query)
    const where: Prisma.UserWhereInput = {}
    if (query.q) {
      where.OR = [
        { discordId: { contains: query.q } },
        { username: { contains: query.q, mode: 'insensitive' } },
        { globalName: { contains: query.q, mode: 'insensitive' } },
        { employee: { lastName: { contains: query.q, mode: 'insensitive' } } },
        { employee: { badgeNumber: { contains: query.q, mode: 'insensitive' } } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { employee: { include: { rank: true } }, roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        ...paging(query),
      }),
    ])
    res.json({
      items: items.map((user) => ({
        id: user.id,
        discordId: user.discordId,
        username: user.username,
        globalName: user.globalName,
        accessGranted: user.accessGranted,
        blocked: user.blocked,
        lastLoginAt: user.lastLoginAt,
        employee: user.employee ? { id: user.employee.id, name: `${user.employee.firstName} ${user.employee.lastName}`, badgeNumber: user.employee.badgeNumber } : null,
        roles: user.roles.map((link) => ({ key: link.role.key, name: link.role.name })),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    })
  }),
)

adminRouter.post(
  '/users/grant',
  action(async (req, res) => {
    const body = parseBody<{ discordId: string; employeeId?: string | null; roleKeys: string[]; username?: string }>(userGrantSchema, req.body)
    const actor = actorOf(req)
    assertCanAssign(actor, body.roleKeys)
    const roles = await loadRoles(body.roleKeys)
    const user = await run(async (tx, effects) => {
      if (body.employeeId) {
        const employee = await tx.employee.findUnique({ where: { id: body.employeeId } })
        if (!employee) throw new HttpError(400, 'EMPLOYEE', 'Сотрудник не найден.')
        const occupied = await tx.user.findFirst({ where: { employeeId: employee.id, NOT: { discordId: body.discordId } } })
        if (occupied) throw new HttpError(409, 'LINKED', 'К сотруднику уже привязана другая учётная запись.')
      }
      const existing = await tx.user.findUnique({ where: { discordId: body.discordId } })
      if (existing?.employeeId && body.employeeId && existing.employeeId !== body.employeeId) {
        throw new HttpError(409, 'LINKED', 'Этот Discord ID уже привязан к другому сотруднику.')
      }
      if (existing) await assertKeepsAdmin(tx, existing.id, body.roleKeys)
      const saved = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { accessGranted: true, blocked: false, employeeId: body.employeeId ?? existing.employeeId, username: body.username || existing.username },
          })
        : await tx.user.create({
            data: {
              discordId: body.discordId,
              username: body.username || `user-${body.discordId.slice(-6)}`,
              accessGranted: true,
              employeeId: body.employeeId ?? null,
            },
          })
      if (body.employeeId) await tx.employee.update({ where: { id: body.employeeId }, data: { discordId: body.discordId } })
      await setRoles(tx, saved.id, roles.map((role) => role.id))
      effects.drop(saved.id)
      await audit(tx, actor, { action: 'access.grant', module: 'access', recordId: saved.id, newValues: { discordId: body.discordId, roles: body.roleKeys } })
      await enqueueNotice(tx, effects, {
        dedupeKey: `access.granted:${saved.id}:${body.roleKeys.join(',')}`,
        kind: 'access.granted',
        title: 'Доступ в архив департамента открыт',
        body: 'Шерифский департамент разрешил вам вход в MDT.',
        module: 'access',
        recordId: saved.id,
        userIds: [saved.id],
        discordIds: [saved.discordId],
        fields: { 'Discord ID': saved.discordId, 'Должности': body.roleKeys.join(', ') },
      })
      return saved
    })
    res.status(201).json({ id: user.id, discordId: user.discordId })
  }),
)

adminRouter.post(
  '/users/:id/roles',
  action(async (req, res) => {
    const body = parseBody<{ roleKeys: string[]; accessGranted?: boolean; reason: string }>(userRolesSchema, req.body)
    const actor = actorOf(req)
    assertCanAssign(actor, body.roleKeys)
    const roles = body.roleKeys.length ? await loadRoles(body.roleKeys) : []
    await run(async (tx, effects) => {
      const user = await tx.user.findUnique({ where: { id: req.params.id } })
      if (!user) throw new HttpError(404, 'NOT_FOUND', 'Пользователь не найден.')
      await assertKeepsAdmin(tx, user.id, body.accessGranted === false ? [] : body.roleKeys)
      await setRoles(tx, user.id, roles.map((role) => role.id))
      if (body.accessGranted !== undefined) {
        await tx.user.update({ where: { id: user.id }, data: { accessGranted: body.accessGranted } })
        if (!body.accessGranted) await revokeSessions(tx, user.id)
      }
      effects.drop(user.id)
      await audit(tx, actor, { action: 'access.grant', module: 'access', recordId: user.id, reason: body.reason, newValues: { roles: body.roleKeys, accessGranted: body.accessGranted } })
    })
    res.json({ ok: true })
  }),
)

adminRouter.post(
  '/users/:id/block',
  action(async (req, res) => {
    await setBlocked(req, true)
    res.json({ ok: true })
  }),
)

adminRouter.post(
  '/users/:id/unblock',
  action(async (req, res) => {
    await setBlocked(req, false)
    res.json({ ok: true })
  }),
)

adminRouter.post(
  '/users/:id/sessions/revoke',
  action(async (req, res) => {
    const actor = actorOf(req)
    const body = parseBody<{ reason: string }>(userRolesSchema.pick({ reason: true }), req.body)
    await run(async (tx, effects) => {
      const user = await tx.user.findUnique({ where: { id: req.params.id } })
      if (!user) throw new HttpError(404, 'NOT_FOUND', 'Пользователь не найден.')
      await revokeSessions(tx, user.id)
      effects.drop(user.id)
      await audit(tx, actor, { action: 'access.revoke', module: 'access', recordId: user.id, reason: body.reason, newValues: { sessions: 'revoked' } })
    })
    res.json({ ok: true })
  }),
)

adminRouter.get(
  '/roles',
  action(async (_req, res) => {
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({ include: { permissions: { include: { permission: true } }, users: true }, orderBy: { name: 'asc' } }),
      prisma.permission.findMany({ orderBy: { key: 'asc' } }),
    ])
    res.json({
      permissions,
      roles: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        system: role.system,
        userCount: role.users.length,
        permissions: role.permissions.map((link) => link.permission.key),
      })),
    })
  }),
)

adminRouter.post(
  '/roles',
  action(async (req, res) => {
    const body = parseBody<{ key: string; name: string; description: string; permissions: string[] }>(roleWriteSchema, req.body)
    const actor = actorOf(req)
    const role = await run(async (tx) => {
      const permissions = await tx.permission.findMany({ where: { key: { in: body.permissions } } })
      if (permissions.length !== new Set(body.permissions).size) throw new HttpError(400, 'PERMISSION', 'Неизвестное право.')
      const created = await tx.role.create({
        data: {
          key: body.key,
          name: body.name,
          description: body.description,
          permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
      })
      await audit(tx, actor, { action: 'role.update', module: 'admin', recordId: created.id, newValues: body })
      return created
    })
    res.status(201).json(role)
  }),
)

adminRouter.patch(
  '/roles/:id',
  action(async (req, res) => {
    const body = parseBody<{ key: string; name: string; description: string; permissions: string[] }>(roleWriteSchema, req.body)
    const actor = actorOf(req)
    await run(async (tx, effects) => {
      const role = await tx.role.findUnique({ where: { id: req.params.id }, include: { users: true } })
      if (!role) throw new HttpError(404, 'NOT_FOUND', 'Роль не найдена.')
      if (role.system && body.key !== role.key) throw new HttpError(400, 'ROLE', 'Ключ системной роли менять нельзя.')
      if (role.key === 'administrator' && !body.permissions.includes(PERMISSIONS.adminAccess)) {
        throw new HttpError(400, 'ROLE', 'У администратора нельзя забрать технический доступ.')
      }
      const permissions = await tx.permission.findMany({ where: { key: { in: body.permissions } } })
      if (permissions.length !== new Set(body.permissions).size) throw new HttpError(400, 'PERMISSION', 'Неизвестное право.')
      await tx.role.update({ where: { id: role.id }, data: { name: body.name, description: body.description, key: body.key } })
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) })
      for (const link of role.users) effects.drop(link.userId)
      await audit(tx, actor, { action: 'role.update', module: 'admin', recordId: role.id, newValues: { permissions: body.permissions, name: body.name } })
    })
    res.json({ ok: true })
  }),
)

adminRouter.delete(
  '/roles/:id',
  action(async (req, res) => {
    const actor = actorOf(req)
    await run(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: req.params.id }, include: { users: true } })
      if (!role) throw new HttpError(404, 'NOT_FOUND', 'Роль не найдена.')
      if (role.system) throw new HttpError(400, 'ROLE', 'Системную роль нельзя удалить.')
      if (role.users.length) throw new HttpError(409, 'ROLE', 'Сначала снимите роль со сотрудников.')
      await tx.role.delete({ where: { id: role.id } })
      await audit(tx, actor, { action: 'role.update', module: 'admin', recordId: role.id, oldValues: { key: role.key }, newValues: { deleted: true } })
    })
    res.json({ ok: true })
  }),
)

adminRouter.get(
  '/settings',
  action(async (_req, res) => {
    const { getSettings } = await import('../lib/settings')
    res.json(await getSettings())
  }),
)

adminRouter.patch(
  '/settings',
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof settingsPatchSchema.parse>>(settingsPatchSchema, req.body)
    const actor = actorOf(req)
    const pairs: [string, Prisma.InputJsonValue][] = []
    if (body.departmentName !== undefined) pairs.push([SETTING_KEYS.departmentName, body.departmentName])
    if (body.countyName !== undefined) pairs.push([SETTING_KEYS.countyName, body.countyName])
    if (body.motto !== undefined) pairs.push([SETTING_KEYS.motto, body.motto])
    if (body.currencySymbol !== undefined) pairs.push([SETTING_KEYS.currencySymbol, body.currencySymbol])
    if (body.currencyCode !== undefined) pairs.push([SETTING_KEYS.currencyCode, body.currencyCode])
    if (body.recognizeFineOnPayment !== undefined) pairs.push([SETTING_KEYS.recognizeFineOnPayment, body.recognizeFineOnPayment])
    if (body.recognizeEquipmentCost !== undefined) pairs.push([SETTING_KEYS.recognizeEquipmentCost, body.recognizeEquipmentCost])
    if (body.discordGuildId !== undefined) pairs.push([SETTING_KEYS.discordGuildId, body.discordGuildId])
    if (body.extraRecipientDiscordIds !== undefined) pairs.push([SETTING_KEYS.extraRecipients, body.extraRecipientDiscordIds])
    if (body.notifyEvents !== undefined) pairs.push([SETTING_KEYS.notifyEvents, body.notifyEvents])
    for (const [key, value] of pairs) await putSetting(key, value)
    clearSettingsCache()
    await run(async (tx) => {
      await audit(tx, actor, { action: 'settings.update', module: 'admin', newValues: body })
    })
    const { getSettings } = await import('../lib/settings')
    res.json(await getSettings())
  }),
)

adminRouter.get(
  '/errors',
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number }>(pageSchema, req.query)
    const [total, items] = await Promise.all([
      prisma.systemError.count(),
      prisma.systemError.findMany({ orderBy: { createdAt: 'desc' }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

adminRouter.get(
  '/backup',
  action(async (req, res) => {
    const actor = actorOf(req)
    const backup = await exportBackup()
    await run(async (tx) => {
      await audit(tx, actor, { action: 'backup.export', module: 'admin', newValues: { createdAt: backup.createdAt } })
    })
    res.setHeader('Content-Disposition', 'attachment; filename="mdt-backup.json"')
    res.json(backup)
  }),
)

adminRouter.post(
  '/backup/restore',
  action(async (req, res) => {
    const body = parseBody<{ confirmation: string; backup: Record<string, unknown> }>(backupRestoreSchema, req.body)
    const actor = actorOf(req)
    const { token } = await restoreBackup(actor, body.backup, req.header('user-agent') ?? '')
    const listeners = await audience(PERMISSIONS.adminAccess)
    await run(async (tx, effects) => {
      await enqueueNotice(tx, effects, {
        dedupeKey: `admin.restore:${Date.now()}`,
        kind: 'admin.restore',
        title: 'Архив департамента восстановлен',
        body: `${actor.name} восстановил базу из резервной копии.`,
        module: 'admin',
        recordId: 'restore',
        userIds: listeners.userIds,
        discordIds: listeners.discordIds,
        fields: { 'Сотрудник': actor.name },
      })
    })
    res.json({ ok: true, token, relogin: true })
  }),
)

adminRouter.post(
  '/demo/archive',
  action(async (req, res) => {
    const actor = actorOf(req)
    await run(async (tx, effects) => {
      await tx.employee.updateMany({ where: { demo: true, archivedAt: null }, data: { archivedAt: new Date(), status: 'dismissed' } })
      await tx.wantedNotice.updateMany({
        where: { demo: true, status: { in: ['active', 'detained'] } },
        data: { status: 'cancelled', closeReason: 'Архивация демонстрационных записей', closedAt: new Date() },
      })
      await tx.equipmentRequest.updateMany({
        where: { demo: true, status: { in: ['pending', 'approved'] } },
        data: { status: 'closed', reviewComment: 'Демонстрационная запись архивирована' },
      })
      await tx.fine.updateMany({
        where: { demo: true, paymentStatus: { in: ['unpaid', 'partial'] } },
        data: { paymentStatus: 'cancelled', sentenceStatus: 'cancelled' },
      })
      await tx.lossRecord.updateMany({
        where: { demo: true, NOT: { status: { in: ['closed', 'written_off'] } } },
        data: { status: 'closed', closedAt: new Date(), closeReason: 'Демонстрационная запись' },
      })
      await tx.inventoryItem.updateMany({ where: { demo: true }, data: { archived: true } })
      await tx.law.updateMany({ where: { isDemo: true, NOT: { status: 'repealed' } }, data: { status: 'repealed' } })
      await audit(tx, actor, { action: 'demo.archive', module: 'admin', reason: 'Демонстрационные записи архивированы, не удалены' })
      await changed(tx, effects, { module: 'personnel', action: 'demo.archive', recordId: 'demo', permission: PERMISSIONS.personnelView })
    })
    res.json({ ok: true })
  }),
)

async function setBlocked(req: Parameters<typeof actorOf>[0], blocked: boolean): Promise<void> {
  const actor = actorOf(req)
  const body = parseBody<{ reason: string }>(userRolesSchema.pick({ reason: true }), req.body)
  if (req.params.id === actor.userId && blocked) throw new HttpError(400, 'SELF', 'Нельзя заблокировать собственный вход.')
  await run(async (tx, effects) => {
    const user = await tx.user.findUnique({ where: { id: req.params.id } })
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Пользователь не найден.')
    if (blocked) await assertKeepsAdmin(tx, user.id, [])
    await tx.user.update({ where: { id: user.id }, data: { blocked } })
    if (blocked) await revokeSessions(tx, user.id)
    effects.drop(user.id)
    await audit(tx, actor, {
      action: blocked ? 'access.block' : 'access.unblock',
      module: 'access',
      recordId: user.id,
      reason: body.reason,
      newValues: { blocked },
    })
  })
}
