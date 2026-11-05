import { Router } from 'express'
import { PERMISSIONS, recordListSchema, seizureCreateSchema, seizureUpdateSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { linkedCitizen } from '../lib/citizen'
import { nextNumber } from '../lib/numbers'
import { prisma, run, type Tx } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'

export const seizuresRouter = Router()

const withCase = { items: true, caseFile: { select: { id: true, caseNumber: true, title: true, status: true } } } as const

async function caseLink(tx: Tx, caseId: string | null): Promise<{ caseId: string | null; relatedCaseRef: string }> {
  if (!caseId) return { caseId: null, relatedCaseRef: '' }
  const row = await tx.caseFile.findUnique({ where: { id: caseId } })
  if (!row) throw new HttpError(400, 'CASE', 'Дело не найдено.')
  return { caseId: row.id, relatedCaseRef: row.caseNumber }
}

seizuresRouter.get(
  '/',
  requirePermission(PERMISSIONS.seizureView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; dir: 'asc' | 'desc'; status: string }>(recordListSchema, req.query)
    const where: Prisma.SeizureWhereInput = {}
    if (query.status) where.propertyStatus = query.status as Prisma.SeizureWhereInput['propertyStatus']
    if (query.q) {
      where.OR = [
        { caseNumber: { contains: query.q, mode: 'insensitive' } },
        { suspectFirstName: { contains: query.q, mode: 'insensitive' } },
        { suspectLastName: { contains: query.q, mode: 'insensitive' } },
        { officerName: { contains: query.q, mode: 'insensitive' } },
        { officerBadge: { contains: query.q, mode: 'insensitive' } },
        { location: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.seizure.count({ where }),
      prisma.seizure.findMany({ where, include: withCase, orderBy: { seizedAt: 'desc' }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

seizuresRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.seizureView),
  action(async (req, res) => {
    const seizure = await prisma.seizure.findUnique({
      where: { id: req.params.id },
      include: { ...withCase, history: { orderBy: { createdAt: 'desc' } } },
    })
    if (!seizure) throw new HttpError(404, 'NOT_FOUND', 'Конфискация не найдена.')
    res.json(seizure)
  }),
)

seizuresRouter.post(
  '/',
  requirePermission(PERMISSIONS.seizureManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof seizureCreateSchema.parse>>(seizureCreateSchema, req.body)
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const person = await linkedCitizen(tx, body.citizenId, { firstName: body.suspectFirstName, lastName: body.suspectLastName })
      const officer = actor.employeeId ? await tx.employee.findUnique({ where: { id: actor.employeeId } }) : null
      const link = body.caseId ? await caseLink(tx, body.caseId) : null
      const seizure = await tx.seizure.create({
        data: {
          caseNumber: await nextNumber(tx, 'seizure', 'SZ'),
          suspectFirstName: person.firstName,
          suspectLastName: person.lastName,
          citizenId: person.citizenId,
          seizedAt: new Date(body.seizedAt),
          grounds: body.grounds,
          officerId: officer?.id,
          officerName: officer ? `${officer.firstName} ${officer.lastName}` : actor.name,
          officerBadge: officer?.badgeNumber ?? '',
          location: body.location,
          relatedCaseRef: link?.relatedCaseRef || body.relatedCaseRef,
          caseId: link?.caseId ?? null,
          notes: body.notes,
          items: { create: body.items },
        },
        include: withCase,
      })
      await tx.seizureEvent.create({
        data: {
          seizureId: seizure.id,
          type: 'created',
          toValue: seizure.caseNumber,
          actorId: actor.userId,
          actorName: actor.name,
          snapshot: JSON.parse(JSON.stringify(seizure)),
        },
      })
      await audit(tx, actor, { action: 'seizure.create', module: 'seizure', recordId: seizure.id, newValues: { caseNumber: seizure.caseNumber } })
      await changed(tx, effects, { module: 'seizure', action: 'seizure.create', recordId: seizure.id, permission: PERMISSIONS.seizureView })
      return seizure
    })
    res.status(201).json(created)
  }),
)

seizuresRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.seizureManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof seizureUpdateSchema.parse>>(seizureUpdateSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.seizure.findUnique({ where: { id: req.params.id }, include: { items: true } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Конфискация не найдена.')
      if (current.version !== body.version) throw conflict()
      const link = body.caseId !== undefined ? await caseLink(tx, body.caseId) : null
      const saved = await tx.seizure.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          suspectFirstName: body.suspectFirstName ?? current.suspectFirstName,
          suspectLastName: body.suspectLastName ?? current.suspectLastName,
          seizedAt: body.seizedAt ? new Date(body.seizedAt) : current.seizedAt,
          grounds: body.grounds ?? current.grounds,
          location: body.location ?? current.location,
          relatedCaseRef: link ? link.relatedCaseRef : (body.relatedCaseRef ?? current.relatedCaseRef),
          caseId: link ? link.caseId : current.caseId,
          notes: body.notes ?? current.notes,
          propertyStatus: body.propertyStatus ?? current.propertyStatus,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      if (body.items) {
        await tx.seizureItem.deleteMany({ where: { seizureId: current.id } })
        await tx.seizureItem.createMany({
          data: body.items.map((item) => ({ name: item.name, quantity: item.quantity, notes: item.notes, seizureId: current.id })),
        })
      }
      const fresh = await tx.seizure.findUniqueOrThrow({ where: { id: current.id }, include: withCase })
      await tx.seizureEvent.create({
        data: {
          seizureId: current.id,
          type: 'updated',
          fromValue: current.propertyStatus,
          toValue: fresh.propertyStatus,
          reason: body.reason,
          actorId: actor.userId,
          actorName: actor.name,
          snapshot: JSON.parse(JSON.stringify({ before: current, after: fresh })),
        },
      })
      await audit(tx, actor, {
        action: 'seizure.update',
        module: 'seizure',
        recordId: current.id,
        reason: body.reason,
        oldValues: { propertyStatus: current.propertyStatus, grounds: current.grounds },
        newValues: { propertyStatus: fresh.propertyStatus, grounds: fresh.grounds },
      })
      await changed(tx, effects, { module: 'seizure', action: 'seizure.update', recordId: current.id, permission: PERMISSIONS.seizureView })
      return fresh
    })
    res.json(updated)
  }),
)
