import { Router } from 'express'
import { PERMISSIONS, caseCreateSchema, caseLinkSchema, caseUpdateSchema, recordListSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { linkedCitizen } from '../lib/citizen'
import { nextNumber } from '../lib/numbers'
import { prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'

export const casesRouter = Router()

const detailInclude = {
  seizures: { orderBy: { seizedAt: 'desc' as const }, include: { items: true } },
  citizen: { select: { id: true, firstName: true, lastName: true, alias: true } },
}

casesRouter.get(
  '/',
  requirePermission(PERMISSIONS.casesView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; dir: 'asc' | 'desc'; status: string }>(recordListSchema, req.query)
    const where: Prisma.CaseFileWhereInput = {}
    if (query.status === 'open' || query.status === 'closed') where.status = query.status
    if (query.q) {
      where.OR = [
        { caseNumber: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { officerName: { contains: query.q, mode: 'insensitive' } },
        { suspectFirstName: { contains: query.q, mode: 'insensitive' } },
        { suspectLastName: { contains: query.q, mode: 'insensitive' } },
        { narrative: { contains: query.q, mode: 'insensitive' } },
        { location: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.caseFile.count({ where }),
      prisma.caseFile.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        ...paging(query),
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
          openedAt: true,
          location: true,
          officerName: true,
          suspectFirstName: true,
          suspectLastName: true,
          version: true,
          _count: { select: { seizures: true } },
        },
      }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

casesRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.casesView),
  action(async (req, res) => {
    const row = await prisma.caseFile.findUnique({ where: { id: req.params.id }, include: detailInclude })
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Дело не найдено.')
    res.json(row)
  }),
)

casesRouter.post(
  '/',
  requirePermission(PERMISSIONS.casesManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof caseCreateSchema.parse>>(caseCreateSchema, req.body)
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const person = await linkedCitizen(tx, body.citizenId, { firstName: '', lastName: '' })
      const officer = actor.employeeId ? await tx.employee.findUnique({ where: { id: actor.employeeId } }) : null
      const row = await tx.caseFile.create({
        data: {
          caseNumber: await nextNumber(tx, 'case', 'DL'),
          title: body.title,
          narrative: body.narrative,
          location: body.location,
          openedAt: body.openedAt ? new Date(body.openedAt) : new Date(),
          citizenId: person.citizenId,
          suspectFirstName: person.citizenId ? person.firstName : '',
          suspectLastName: person.citizenId ? person.lastName : '',
          officerId: officer?.id,
          officerName: officer ? `${officer.firstName} ${officer.lastName}` : actor.name,
          officerBadge: officer?.badgeNumber ?? '',
        },
      })
      await audit(tx, actor, { action: 'case.create', module: 'cases', recordId: row.id, newValues: { caseNumber: row.caseNumber, title: row.title } })
      await changed(tx, effects, { module: 'cases', action: 'case.create', recordId: row.id, permission: PERMISSIONS.casesView })
      return row
    })
    res.status(201).json(created)
  }),
)

casesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.casesManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof caseUpdateSchema.parse>>(caseUpdateSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.caseFile.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Дело не найдено.')
      if (current.version !== body.version) throw conflict()
      const status = body.status ?? current.status
      const closeReason = body.closeReason || body.reason
      if (status === 'closed' && current.status !== 'closed' && closeReason.trim().length < 3) {
        throw new HttpError(400, 'REASON', 'Укажите, почему дело закрыто.')
      }
      const saved = await tx.caseFile.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          title: body.title ?? current.title,
          narrative: body.narrative ?? current.narrative,
          location: body.location ?? current.location,
          status,
          closedAt: status === 'closed' ? current.closedAt ?? new Date() : null,
          closeReason: status === 'closed' ? closeReason : '',
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      await audit(tx, actor, {
        action: 'case.update',
        module: 'cases',
        recordId: current.id,
        reason: body.reason || closeReason,
        oldValues: { title: current.title, status: current.status },
        newValues: { title: body.title ?? current.title, status },
      })
      await changed(tx, effects, { module: 'cases', action: 'case.update', recordId: current.id, permission: PERMISSIONS.casesView })
      return tx.caseFile.findUniqueOrThrow({ where: { id: current.id }, include: detailInclude })
    })
    res.json(updated)
  }),
)

casesRouter.post(
  '/:id/link',
  requirePermission(PERMISSIONS.casesManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof caseLinkSchema.parse>>(caseLinkSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.caseFile.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Дело не найдено.')
      const seizure = await tx.seizure.findUnique({ where: { id: body.seizureId } })
      if (!seizure) throw new HttpError(404, 'NOT_FOUND', 'Конфискация не найдена.')
      if (body.unlink) {
        if (seizure.caseId !== current.id) throw new HttpError(400, 'CASE', 'Эта конфискация привязана к другому делу.')
        await tx.seizure.update({ where: { id: seizure.id }, data: { caseId: null, relatedCaseRef: '', version: { increment: 1 } } })
      } else {
        await tx.seizure.update({
          where: { id: seizure.id },
          data: { caseId: current.id, relatedCaseRef: current.caseNumber, version: { increment: 1 } },
        })
      }
      await audit(tx, actor, {
        action: 'case.link',
        module: 'cases',
        recordId: current.id,
        newValues: { seizureId: seizure.id, caseNumber: body.unlink ? '' : current.caseNumber },
      })
      await changed(tx, effects, { module: 'cases', action: 'case.link', recordId: current.id, permission: PERMISSIONS.casesView })
      await changed(tx, effects, { module: 'seizure', action: 'seizure.update', recordId: seizure.id, permission: PERMISSIONS.seizureView })
      return tx.caseFile.findUniqueOrThrow({ where: { id: current.id }, include: detailInclude })
    })
    res.json(updated)
  }),
)
