import { DEPARTMENT_ROLE_KEYS, PERMISSIONS, type RoleKey } from '@mdt/shared'
import type { Actor } from '../lib/actor'
import { audit } from '../lib/audit'
import { HttpError } from '../lib/http'
import { prisma, type Effects, type Tx } from '../lib/prisma'

const departmentRoles = new Set<string>(DEPARTMENT_ROLE_KEYS)

export async function loadRoles(keys: string[]) {
  const unique = [...new Set(keys)]
  const roles = await prisma.role.findMany({ where: { key: { in: unique } } })
  if (roles.length !== unique.length) throw new HttpError(400, 'ROLE', 'Неизвестная должность.')
  return roles
}

export function assertCanAssign(actor: Actor, keys: string[]): void {
  if (!actor.permissions.has(PERMISSIONS.adminAccess) && !actor.permissions.has(PERMISSIONS.personnelManage) && !actor.permissions.has(PERMISSIONS.usersManage)) {
    throw new HttpError(403, 'FORBIDDEN', 'Недостаточно полномочий для назначения должности.')
  }
  if (keys.includes('administrator') && !actor.permissions.has(PERMISSIONS.adminAccess)) {
    throw new HttpError(403, 'FORBIDDEN', 'Назначать администратора может только администратор.')
  }
  if (!actor.permissions.has(PERMISSIONS.adminAccess) && keys.some((key) => !departmentRoles.has(key))) {
    throw new HttpError(403, 'FORBIDDEN', 'Особые роли назначает только администратор.')
  }
}

export async function assertKeepsAdmin(tx: Tx, userId: string, nextKeys: string[]): Promise<void> {
  if (nextKeys.includes('administrator')) return
  const adminRole = await tx.role.findUnique({ where: { key: 'administrator' } })
  if (!adminRole) return
  const stillAdmin = await tx.userRole.findFirst({ where: { userId, roleId: adminRole.id } })
  if (!stillAdmin) return
  const others = await tx.userRole.count({
    where: { roleId: adminRole.id, userId: { not: userId }, user: { blocked: false, accessGranted: true } },
  })
  if (others < 1) throw new HttpError(409, 'LAST_ADMIN', 'Нельзя снять полномочия с последнего администратора.')
}

export async function setRoles(tx: Tx, userId: string, roleIds: string[]): Promise<void> {
  await tx.userRole.deleteMany({ where: { userId } })
  if (roleIds.length) await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) })
}

export async function revokeSessions(tx: Tx, userId: string): Promise<void> {
  await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}

export async function provisionAccess(
  tx: Tx,
  effects: Effects,
  actor: Actor,
  input: { discordId: string | null; employeeId: string; grantAccess: boolean; roleKeys: string[] },
): Promise<void> {
  if (!input.grantAccess) {
    const linked = input.discordId
      ? await tx.user.findUnique({ where: { discordId: input.discordId } })
      : await tx.user.findUnique({ where: { employeeId: input.employeeId } })
    if (linked && (linked.employeeId === input.employeeId || linked.employeeId === null)) {
      await assertKeepsAdmin(tx, linked.id, [])
      await tx.user.update({ where: { id: linked.id }, data: { accessGranted: false } })
      await revokeSessions(tx, linked.id)
      effects.drop(linked.id)
      await audit(tx, actor, { action: 'access.revoke', module: 'access', recordId: linked.id, reason: 'Доступ отозван при сохранении карточки' })
    }
    if (input.discordId) {
      await tx.employee.update({ where: { id: input.employeeId }, data: { discordId: input.discordId } })
    }
    return
  }
  if (!input.discordId) throw new HttpError(400, 'DISCORD', 'Чтобы открыть доступ, укажите Discord ID.')
  if (!input.roleKeys.length) throw new HttpError(400, 'ROLE', 'Выберите хотя бы одну должность.')
  assertCanAssign(actor, input.roleKeys)
  const roles = await loadRoles(input.roleKeys)
  const taken = await tx.user.findFirst({ where: { employeeId: input.employeeId, NOT: { discordId: input.discordId } } })
  if (taken) {
    await assertKeepsAdmin(tx, taken.id, [])
    await tx.user.update({ where: { id: taken.id }, data: { employeeId: null, accessGranted: false } })
    await revokeSessions(tx, taken.id)
    effects.drop(taken.id)
  }
  const existing = await tx.user.findUnique({ where: { discordId: input.discordId } })
  if (existing?.employeeId && existing.employeeId !== input.employeeId) {
    throw new HttpError(409, 'LINKED', 'Этот Discord ID уже привязан к другому сотруднику.')
  }
  if (existing) await assertKeepsAdmin(tx, existing.id, input.roleKeys)
  const user = existing
    ? await tx.user.update({
        where: { id: existing.id },
        data: { employeeId: input.employeeId, accessGranted: true, blocked: false },
      })
    : await tx.user.create({
        data: {
          discordId: input.discordId,
          username: `deputy-${input.discordId.slice(-6)}`,
          employeeId: input.employeeId,
          accessGranted: true,
        },
      })
  await setRoles(tx, user.id, roles.map((role) => role.id))
  await tx.employee.update({ where: { id: input.employeeId }, data: { discordId: input.discordId } })
  effects.drop(user.id)
  await audit(tx, actor, {
    action: 'access.grant',
    module: 'access',
    recordId: user.id,
    newValues: { discordId: input.discordId, roles: input.roleKeys, employeeId: input.employeeId },
  })
}

export function isDepartmentRole(key: string): key is RoleKey {
  return departmentRoles.has(key)
}
