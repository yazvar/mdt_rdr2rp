import { Router } from 'express'
import { DEPARTMENT_ROLE_KEYS, PERMISSIONS, employeeCreateSchema, employeeListSchema, employeeUpdateSchema, reasonSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'
import { provisionAccess } from '../services/access'

export const employeesRouter = Router()

const include = {
  rank: true,
  user: { include: { roles: { include: { role: true } } } },
} satisfies Prisma.EmployeeInclude

type Row = Prisma.EmployeeGetPayload<{ include: typeof include }>

function present(employee: Row) {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    badgeNumber: employee.badgeNumber,
    rankId: employee.rankId,
    rank: employee.rank.name,
    position: employee.position,
    discordId: employee.discordId ?? employee.user?.discordId ?? null,
    status: employee.status,
    joinedAt: employee.joinedAt,
    contact: employee.contact,
    notes: employee.notes,
    serviceComments: employee.serviceComments,
    archivedAt: employee.archivedAt,
    demo: employee.demo,
    version: employee.version,
    updatedAt: employee.updatedAt,
    accessGranted: employee.user?.accessGranted ?? false,
    blocked: employee.user?.blocked ?? false,
    roles: employee.user?.roles.map((link) => ({ key: link.role.key, name: link.role.name })) ?? [],
  }
}

function order(sort: string, dir: 'asc' | 'desc'): Prisma.EmployeeOrderByWithRelationInput {
  if (sort === 'badge') return { badgeNumber: dir }
  if (sort === 'joined') return { joinedAt: dir }
  if (sort === 'status') return { status: dir }
  if (sort === 'firstName') return { firstName: dir }
  if (sort === 'rank') return { rank: { sortOrder: dir } }
  return { lastName: 'asc' }
}

employeesRouter.get(
  '/',
  requirePermission(PERMISSIONS.personnelView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; sort: string; dir: 'asc' | 'desc'; status: string; rankId: string; archived: string }>(
      employeeListSchema,
      req.query,
    )
    const where: Prisma.EmployeeWhereInput = {}
    if (query.archived === '0') where.archivedAt = null
    if (query.archived === '1') where.archivedAt = { not: null }
    if (query.status) where.status = query.status as Prisma.EmployeeWhereInput['status']
    if (query.rankId) where.rankId = query.rankId
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { badgeNumber: { contains: query.q, mode: 'insensitive' } },
        { discordId: { contains: query.q, mode: 'insensitive' } },
        { position: { contains: query.q, mode: 'insensitive' } },
        { rank: { name: { contains: query.q, mode: 'insensitive' } } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({ where, include, orderBy: order(query.sort, query.dir), ...paging(query) }),
    ])
    res.json({ items: items.map(present), page: query.page, pageSize: query.pageSize, total })
  }),
)

employeesRouter.get(
  '/roles',
  requirePermission(PERMISSIONS.personnelManage),
  action(async (req, res) => {
    const actor = actorOf(req)
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } })
    const items = roles.filter((item) => actor.permissions.has(PERMISSIONS.adminAccess) || DEPARTMENT_ROLE_KEYS.includes(item.key as (typeof DEPARTMENT_ROLE_KEYS)[number]))
    res.json({ items: items.map((item) => ({ key: item.key, name: item.name, description: item.description })) })
  }),
)

employeesRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.personnelView),
  action(async (req, res) => {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { ...include, history: { orderBy: { createdAt: 'desc' }, take: 100 } },
    })
    if (!employee) throw new HttpError(404, 'NOT_FOUND', 'Сотрудник не найден.')
    res.json({ ...present(employee), history: employee.history })
  }),
)

employeesRouter.post(
  '/',
  requirePermission(PERMISSIONS.personnelManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof employeeCreateSchema.parse>>(employeeCreateSchema, req.body)
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const rank = await tx.rank.findUnique({ where: { id: body.rankId } })
      if (!rank || !rank.active) throw new HttpError(400, 'RANK', 'Выберите действующее звание.')
      const employee = await tx.employee.create({
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          badgeNumber: body.badgeNumber,
          rankId: rank.id,
          position: body.position || null,
          discordId: body.discordId,
          status: body.status,
          joinedAt: new Date(body.joinedAt),
          contact: body.contact,
          notes: body.notes,
          serviceComments: body.serviceComments,
          archivedAt: body.status === 'dismissed' ? new Date() : null,
        },
        include,
      })
      await tx.employeeHistory.create({
        data: { employeeId: employee.id, type: 'created', toValue: `${employee.lastName} ${employee.firstName}`, actorId: actor.userId, actorName: actor.name },
      })
      if (body.grantAccess) {
        await provisionAccess(tx, effects, actor, {
          discordId: body.discordId,
          employeeId: employee.id,
          grantAccess: true,
          roleKeys: body.roleKeys,
        })
      } else if (body.discordId) {
        await tx.employee.update({ where: { id: employee.id }, data: { discordId: body.discordId } })
      }
      await audit(tx, actor, { action: 'employee.create', module: 'personnel', recordId: employee.id, newValues: { badgeNumber: employee.badgeNumber, name: `${employee.firstName} ${employee.lastName}` } })
      await changed(tx, effects, { module: 'personnel', action: 'employee.create', recordId: employee.id, permission: PERMISSIONS.personnelView })
      return tx.employee.findUniqueOrThrow({ where: { id: employee.id }, include })
    })
    res.status(201).json(present(created))
  }),
)

employeesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.personnelManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof employeeUpdateSchema.parse>>(employeeUpdateSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.employee.findUnique({ where: { id: req.params.id }, include })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Сотрудник не найден.')
      if (current.version !== body.version) throw conflict()
      const nextRank = body.rankId ? await tx.rank.findUnique({ where: { id: body.rankId } }) : current.rank
      if (!nextRank || !nextRank.active) throw new HttpError(400, 'RANK', 'Выберите действующее звание.')
      const nextStatus = body.status ?? current.status
      const rankChanged = nextRank.id !== current.rankId
      const statusChanged = nextStatus !== current.status
      if ((rankChanged || statusChanged) && body.reason.trim().length < 3) {
        throw new HttpError(400, 'REASON', 'Укажите причину изменения звания или статуса.')
      }
      const discordId = body.discordId === undefined ? current.discordId : body.discordId || null
      const saved = await tx.employee.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          firstName: body.firstName ?? current.firstName,
          lastName: body.lastName ?? current.lastName,
          badgeNumber: body.badgeNumber ?? current.badgeNumber,
          rankId: nextRank.id,
          position: body.position === undefined ? current.position : body.position || null,
          discordId,
          status: nextStatus,
          joinedAt: body.joinedAt ? new Date(body.joinedAt) : current.joinedAt,
          contact: body.contact ?? current.contact,
          notes: body.notes ?? current.notes,
          serviceComments: body.serviceComments ?? current.serviceComments,
          archivedAt: nextStatus === 'dismissed' ? current.archivedAt ?? new Date() : null,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      const history: Prisma.EmployeeHistoryCreateManyInput[] = []
      const full = (first: string, last: string) => `${last} ${first}`
      if (body.firstName || body.lastName) {
        const nextName = full(body.firstName ?? current.firstName, body.lastName ?? current.lastName)
        if (nextName !== full(current.firstName, current.lastName)) {
          history.push({ employeeId: current.id, type: 'name', fromValue: full(current.firstName, current.lastName), toValue: nextName, reason: body.reason, actorId: actor.userId, actorName: actor.name })
        }
      }
      if (body.badgeNumber && body.badgeNumber !== current.badgeNumber) {
        history.push({ employeeId: current.id, type: 'badge', fromValue: current.badgeNumber, toValue: body.badgeNumber, reason: body.reason, actorId: actor.userId, actorName: actor.name })
      }
      if (rankChanged) {
        history.push({
          employeeId: current.id,
          type: nextRank.sortOrder < current.rank.sortOrder ? 'promotion' : 'demotion',
          fromValue: current.rank.name,
          toValue: nextRank.name,
          reason: body.reason,
          actorId: actor.userId,
          actorName: actor.name,
        })
      }
      if (statusChanged) {
        history.push({ employeeId: current.id, type: 'status', fromValue: current.status, toValue: nextStatus, reason: body.reason, actorId: actor.userId, actorName: actor.name })
      }
      if (history.length) await tx.employeeHistory.createMany({ data: history })
      if (body.grantAccess !== undefined) {
        await provisionAccess(tx, effects, actor, {
          discordId,
          employeeId: current.id,
          grantAccess: body.grantAccess,
          roleKeys: body.roleKeys ?? [],
        })
      }
      await audit(tx, actor, {
        action: 'employee.update',
        module: 'personnel',
        recordId: current.id,
        reason: body.reason,
        oldValues: { badgeNumber: current.badgeNumber, status: current.status, rank: current.rank.name },
        newValues: { badgeNumber: body.badgeNumber ?? current.badgeNumber, status: nextStatus, rank: nextRank.name },
      })
      await changed(tx, effects, { module: 'personnel', action: 'employee.update', recordId: current.id, permission: PERMISSIONS.personnelView })
      return tx.employee.findUniqueOrThrow({ where: { id: current.id }, include })
    })
    res.json(present(updated))
  }),
)

employeesRouter.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.personnelManage),
  action(async (req, res) => {
    const body = parseBody<{ reason: string; version?: number }>(reasonSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.employee.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Сотрудник не найден.')
      if (body.version && current.version !== body.version) throw conflict()
      const saved = await tx.employee.updateMany({
        where: { id: current.id, version: current.version },
        data: { status: 'dismissed', archivedAt: new Date(), version: { increment: 1 } },
      })
      if (saved.count !== 1) throw conflict()
      await tx.employeeHistory.create({
        data: { employeeId: current.id, type: 'archived', fromValue: current.status, toValue: 'dismissed', reason: body.reason, actorId: actor.userId, actorName: actor.name },
      })
      await audit(tx, actor, { action: 'employee.archive', module: 'personnel', recordId: current.id, reason: body.reason })
      await changed(tx, effects, { module: 'personnel', action: 'employee.archive', recordId: current.id, permission: PERMISSIONS.personnelView })
      return tx.employee.findUniqueOrThrow({ where: { id: current.id }, include })
    })
    res.json(present(updated))
  }),
)

employeesRouter.post(
  '/:id/restore',
  requirePermission(PERMISSIONS.personnelManage),
  action(async (req, res) => {
    const body = parseBody<{ reason: string; version?: number }>(reasonSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.employee.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Сотрудник не найден.')
      const saved = await tx.employee.updateMany({
        where: { id: current.id, version: current.version },
        data: { status: 'active', archivedAt: null, version: { increment: 1 } },
      })
      if (saved.count !== 1) throw conflict()
      await tx.employeeHistory.create({
        data: { employeeId: current.id, type: 'restored', fromValue: current.status, toValue: 'active', reason: body.reason, actorId: actor.userId, actorName: actor.name },
      })
      await audit(tx, actor, { action: 'employee.restore', module: 'personnel', recordId: current.id, reason: body.reason })
      await changed(tx, effects, { module: 'personnel', action: 'employee.restore', recordId: current.id, permission: PERMISSIONS.personnelView })
      return tx.employee.findUniqueOrThrow({ where: { id: current.id }, include })
    })
    res.json(present(updated))
  }),
)
