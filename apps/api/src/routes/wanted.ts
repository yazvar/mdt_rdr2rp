import { Router } from 'express'
import { PERMISSIONS, recordListSchema, summarizeCharges, wantedCreateSchema, wantedUpdateSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { linkedCitizen } from '../lib/citizen'
import { resolveCharges } from '../lib/sentence'
import { nextNumber } from '../lib/numbers'
import { audience, enqueueNotice } from '../lib/notify'
import { prisma, run } from '../lib/prisma'
import { assertPhoto, paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'

export const wantedRouter = Router()

function presentList<T extends { photoData: string }>(row: T) {
  const { photoData, ...rest } = row
  return { ...rest, hasPhoto: Boolean(photoData) }
}

wantedRouter.get(
  '/',
  requirePermission(PERMISSIONS.wantedView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; dir: 'asc' | 'desc'; status: string; category: string }>(recordListSchema, req.query)
    const level = typeof req.query.level === 'string' ? Number(req.query.level) : undefined
    const where: Prisma.WantedNoticeWhereInput = {}
    if (query.status) where.status = query.status as Prisma.WantedNoticeWhereInput['status']
    if (level && level >= 1 && level <= 5) where.wantedLevel = level
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { caseNumber: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.wantedNotice.count({ where }),
      prisma.wantedNotice.findMany({
        where,
        include: { charges: true },
        orderBy: { postedAt: 'desc' },
        ...paging(query),
      }),
    ])
    res.json({ items: items.map(presentList), page: query.page, pageSize: query.pageSize, total })
  }),
)

wantedRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.wantedView),
  action(async (req, res) => {
    const notice = await prisma.wantedNotice.findUnique({
      where: { id: req.params.id },
      include: {
        charges: true,
        events: { orderBy: { createdAt: 'desc' } },
        fines: { orderBy: { issuedAt: 'desc' }, include: { charges: true } },
      },
    })
    if (!notice) throw new HttpError(404, 'NOT_FOUND', 'Розыск не найден.')
    res.json(notice)
  }),
)

async function chargesFromLaws(tx: Prisma.TransactionClient, lawIds: string[]) {
  if (!lawIds.length) return []
  const laws = await tx.law.findMany({ where: { id: { in: lawIds } } })
  if (laws.length !== new Set(lawIds).size) throw new HttpError(400, 'LAW', 'Одна из статей не найдена.')
  if (laws.some((law) => law.status === 'repealed')) throw new HttpError(400, 'LAW', 'Нельзя ссылаться на отменённую статью.')
  return laws
}

wantedRouter.post(
  '/',
  requirePermission(PERMISSIONS.wantedCreate),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof wantedCreateSchema.parse>>(wantedCreateSchema, req.body)
    assertPhoto(body.photoData)
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const resolved = await resolveCharges(tx, { lawIds: body.lawIds, charges: body.charges })
      const summary = resolved?.summary ?? { fineCents: 0, jailDays: 0, additionalPenalties: '' }
      const person = await linkedCitizen(tx, body.citizenId, body)
      const officer = actor.employeeId ? await tx.employee.findUnique({ where: { id: actor.employeeId } }) : null
      const notice = await tx.wantedNotice.create({
        data: {
          caseNumber: await nextNumber(tx, 'wanted', 'WN'),
          firstName: person.firstName,
          lastName: person.lastName,
          citizenId: person.citizenId,
          photoUrl: body.photoUrl,
          photoData: body.photoData || person.photoData,
          postedAt: body.postedAt ? new Date(body.postedAt) : new Date(),
          grounds: body.grounds,
          description: body.description,
          wantedLevel: body.wantedLevel,
          fineCents: body.fineCents ?? summary.fineCents,
          jailDays: body.jailDays ?? summary.jailDays,
          createdById: officer?.id,
          createdByName: officer ? `${officer.firstName} ${officer.lastName}` : actor.name,
          createdByBadge: officer?.badgeNumber ?? '',
          evidence: body.evidence,
          charges: {
            create: (resolved?.chosen ?? []).map((row) => ({
              lawId: row.law.id,
              articleNumber: row.law.articleNumber,
              title: row.law.title,
            })),
          },
        },
        include: { charges: true },
      })
      await tx.wantedEvent.create({
        data: { wantedId: notice.id, type: 'created', toValue: notice.caseNumber, actorId: actor.userId, actorName: actor.name },
      })
      await audit(tx, actor, { action: 'wanted.create', module: 'wanted', recordId: notice.id, newValues: { caseNumber: notice.caseNumber, level: notice.wantedLevel } })
      await changed(tx, effects, { module: 'wanted', action: 'wanted.create', recordId: notice.id, permission: PERMISSIONS.wantedView })
      const listeners = await audience(PERMISSIONS.wantedManage)
      await enqueueNotice(tx, effects, {
        dedupeKey: `wanted.created:${notice.id}`,
        kind: 'wanted.created',
        title: 'Новый розыск',
        body: `${notice.lastName} ${notice.firstName}, дело ${notice.caseNumber}, уровень ${notice.wantedLevel}.`,
        module: 'wanted',
        recordId: notice.id,
        userIds: listeners.userIds,
        discordIds: listeners.discordIds,
        fields: {
          'Дело': notice.caseNumber,
          'Разыскиваемый': `${notice.firstName} ${notice.lastName}`,
          'Уровень': notice.wantedLevel,
          'Объявил': notice.createdByName,
        },
      })
      return notice
    })
    res.status(201).json(created)
  }),
)

wantedRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.wantedCreate),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof wantedUpdateSchema.parse>>(wantedUpdateSchema, req.body)
    if (body.photoData) assertPhoto(body.photoData)
    const actor = actorOf(req)
    const closing = body.status === 'closed' || body.status === 'cancelled'
    if (closing && (body.closeReason ?? body.reason).trim().length < 3) {
      throw new HttpError(400, 'REASON', 'Укажите причину закрытия или отмены розыска.')
    }
    const updated = await run(async (tx, effects) => {
      const current = await tx.wantedNotice.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Розыск не найден.')
      if (current.version !== body.version) throw conflict()
      const laws = body.lawIds ? await chargesFromLaws(tx, body.lawIds) : null
      const summary = laws ? summarizeCharges(laws) : null
      const nextStatus = body.status ?? current.status
      const saved = await tx.wantedNotice.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          firstName: body.firstName ?? current.firstName,
          lastName: body.lastName ?? current.lastName,
          photoUrl: body.photoUrl ?? current.photoUrl,
          photoData: body.photoData ?? current.photoData,
          grounds: body.grounds ?? current.grounds,
          description: body.description ?? current.description,
          wantedLevel: body.wantedLevel ?? current.wantedLevel,
          fineCents: body.fineCents ?? summary?.fineCents ?? current.fineCents,
          jailDays: body.jailDays ?? summary?.jailDays ?? current.jailDays,
          evidence: body.evidence ?? current.evidence,
          status: nextStatus,
          closeReason: body.closeReason ?? (closing ? body.reason : current.closeReason),
          closedAt: closing ? new Date() : nextStatus === 'active' ? null : current.closedAt,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      if (laws) {
        await tx.wantedCharge.deleteMany({ where: { wantedId: current.id } })
        await tx.wantedCharge.createMany({
          data: laws.map((law) => ({ wantedId: current.id, lawId: law.id, articleNumber: law.articleNumber, title: law.title })),
        })
      }
      await tx.wantedEvent.create({
        data: {
          wantedId: current.id,
          type: closing ? nextStatus : 'updated',
          fromValue: current.status,
          toValue: nextStatus,
          reason: body.closeReason || body.reason,
          actorId: actor.userId,
          actorName: actor.name,
        },
      })
      await audit(tx, actor, {
        action: 'wanted.update',
        module: 'wanted',
        recordId: current.id,
        reason: body.closeReason || body.reason,
        oldValues: { status: current.status, level: current.wantedLevel },
        newValues: { status: nextStatus, level: body.wantedLevel ?? current.wantedLevel },
      })
      await changed(tx, effects, { module: 'wanted', action: 'wanted.update', recordId: current.id, permission: PERMISSIONS.wantedView })
      return tx.wantedNotice.findUniqueOrThrow({ where: { id: current.id }, include: { charges: true, fines: true, events: { orderBy: { createdAt: 'desc' } } } })
    })
    res.json(updated)
  }),
)
