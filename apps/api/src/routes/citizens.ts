import { Router } from 'express'
import { PERMISSIONS, citizenCreateSchema, citizenUpdateSchema, reasonSchema, recordListSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { prisma, run } from '../lib/prisma'
import { assertPhoto, paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'

export const citizensRouter = Router()

function present<T extends { photoData: string; photoUrl: string }>(row: T, withPhoto: boolean) {
  const { photoData, ...rest } = row
  return withPhoto ? { ...rest, photoData } : { ...rest, hasPhoto: Boolean(photoData || row.photoUrl) }
}

citizensRouter.get(
  '/',
  requirePermission(PERMISSIONS.citizensView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; dir: 'asc' | 'desc'; status: string }>(recordListSchema, req.query)
    const where: Prisma.CitizenWhereInput = { archivedAt: query.status === 'archived' ? { not: null } : null }
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { alias: { contains: query.q, mode: 'insensitive' } },
        { residence: { contains: query.q, mode: 'insensitive' } },
        { occupation: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.citizen.count({ where }),
      prisma.citizen.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], ...paging(query) }),
    ])
    res.json({ items: items.map((item) => present(item, false)), page: query.page, pageSize: query.pageSize, total })
  }),
)

citizensRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.citizensView),
  action(async (req, res) => {
    const citizen = await prisma.citizen.findUnique({ where: { id: req.params.id } })
    if (!citizen) throw new HttpError(404, 'NOT_FOUND', 'Гражданин не найден.')
    res.json(present(citizen, true))
  }),
)

citizensRouter.post(
  '/',
  requirePermission(PERMISSIONS.citizensManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof citizenCreateSchema.parse>>(citizenCreateSchema, req.body)
    assertPhoto(body.photoData)
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const citizen = await tx.citizen.create({ data: body })
      await audit(tx, actor, {
        action: 'citizen.create',
        module: 'citizens',
        recordId: citizen.id,
        newValues: { firstName: citizen.firstName, lastName: citizen.lastName },
      })
      await changed(tx, effects, { module: 'citizens', action: 'citizen.create', recordId: citizen.id, permission: PERMISSIONS.citizensView })
      return citizen
    })
    res.status(201).json(present(created, true))
  }),
)

citizensRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.citizensManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof citizenUpdateSchema.parse>>(citizenUpdateSchema, req.body)
    if (body.photoData) assertPhoto(body.photoData)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.citizen.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Гражданин не найден.')
      if (current.archivedAt) throw new HttpError(400, 'ARCHIVED', 'Карточка в архиве. Сначала верните её.')
      if (current.version !== body.version) throw conflict()
      const saved = await tx.citizen.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          alias: body.alias,
          occupation: body.occupation,
          residence: body.residence,
          marks: body.marks,
          notes: body.notes,
          photoData: body.photoData,
          photoUrl: body.photoUrl,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      await audit(tx, actor, {
        action: 'citizen.update',
        module: 'citizens',
        recordId: current.id,
        oldValues: { firstName: current.firstName, lastName: current.lastName },
        newValues: { firstName: body.firstName, lastName: body.lastName },
      })
      await changed(tx, effects, { module: 'citizens', action: 'citizen.update', recordId: current.id, permission: PERMISSIONS.citizensView })
      return tx.citizen.findUniqueOrThrow({ where: { id: current.id } })
    })
    res.json(present(updated, true))
  }),
)

citizensRouter.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.citizensManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof reasonSchema.parse>>(reasonSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.citizen.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Гражданин не найден.')
      if (body.version && current.version !== body.version) throw conflict()
      const archived = Boolean(current.archivedAt)
      const saved = await tx.citizen.updateMany({
        where: { id: current.id, version: current.version },
        data: { archivedAt: archived ? null : new Date(), version: { increment: 1 } },
      })
      if (saved.count !== 1) throw conflict()
      await audit(tx, actor, {
        action: archived ? 'citizen.restore' : 'citizen.archive',
        module: 'citizens',
        recordId: current.id,
        reason: body.reason,
        newValues: { archived: !archived },
      })
      await changed(tx, effects, { module: 'citizens', action: 'citizen.archive', recordId: current.id, permission: PERMISSIONS.citizensView })
      return tx.citizen.findUniqueOrThrow({ where: { id: current.id } })
    })
    res.json(present(updated, true))
  }),
)
