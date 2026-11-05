import { Router } from 'express'
import { PERMISSIONS, searchSchema, syncSchema } from '@mdt/shared'
import { action } from '../lib/http'
import { prisma } from '../lib/prisma'
import { parseQuery } from '../lib/validate'
import { actorOf, requireAuth } from '../middleware/auth'

export const metaRouter = Router()

metaRouter.use(requireAuth)

metaRouter.get(
  '/dashboard',
  action(async (req, res) => {
    const actor = actorOf(req)
    const can = (key: string) => actor.permissions.has(key)
    const [employeeCounts, wanted, seizures, requests, fines, activity, notifications, unread] = await Promise.all([
      can(PERMISSIONS.personnelView)
        ? prisma.employee.groupBy({ by: ['status'], where: { archivedAt: null }, _count: { _all: true } })
        : Promise.resolve(null),
      can(PERMISSIONS.wantedView)
        ? prisma.wantedNotice.findMany({ where: { status: 'active' }, orderBy: { postedAt: 'desc' }, take: 6, select: { id: true, caseNumber: true, firstName: true, lastName: true, wantedLevel: true, postedAt: true } })
        : Promise.resolve(null),
      can(PERMISSIONS.seizureView)
        ? prisma.seizure.findMany({ orderBy: { seizedAt: 'desc' }, take: 5, select: { id: true, caseNumber: true, suspectFirstName: true, suspectLastName: true, seizedAt: true, propertyStatus: true } })
        : Promise.resolve(null),
      can(PERMISSIONS.requestsReview)
        ? prisma.equipmentRequest.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 6 })
        : actor.employeeId
          ? prisma.equipmentRequest.findMany({ where: { employeeId: actor.employeeId }, orderBy: { createdAt: 'desc' }, take: 6 })
          : Promise.resolve([]),
      can(PERMISSIONS.finesView)
        ? prisma.fine.findMany({ orderBy: { issuedAt: 'desc' }, take: 6, select: { id: true, fineNumber: true, offenderFirstName: true, offenderLastName: true, amountCents: true, paymentStatus: true, issuedAt: true } })
        : Promise.resolve(null),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, actorName: true, action: true, module: true, recordId: true, createdAt: true, result: true },
      }),
      prisma.notification.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
    ])
    const count = (status: string) => employeeCounts?.find((row) => row.status === status)?._count._all ?? 0
    res.json({
      generatedAt: new Date().toISOString(),
      employees: employeeCounts ? { active: count('active'), suspended: count('suspended'), onLeave: count('on_leave') } : null,
      wanted,
      seizures,
      requests,
      fines,
      activity,
      notifications,
      unread,
    })
  }),
)

metaRouter.get(
  '/search',
  action(async (req, res) => {
    const actor = actorOf(req)
    const query = parseQuery<{ q: string }>(searchSchema, req.query)
    const q = query.q
    const [employees, citizens, wanted, fines, seizures, laws] = await Promise.all([
      actor.permissions.has(PERMISSIONS.personnelView)
        ? prisma.employee.findMany({
            where: {
              archivedAt: null,
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { badgeNumber: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: 8,
            select: { id: true, firstName: true, lastName: true, badgeNumber: true, status: true },
          })
        : Promise.resolve([]),
      actor.permissions.has(PERMISSIONS.citizensView)
        ? prisma.citizen.findMany({
            where: {
              archivedAt: null,
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { alias: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: 8,
            select: { id: true, firstName: true, lastName: true, alias: true },
          })
        : Promise.resolve([]),
      actor.permissions.has(PERMISSIONS.wantedView)
        ? prisma.wantedNotice.findMany({
            where: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { caseNumber: { contains: q, mode: 'insensitive' } }] },
            take: 8,
            select: { id: true, caseNumber: true, firstName: true, lastName: true, status: true },
          })
        : Promise.resolve([]),
      actor.permissions.has(PERMISSIONS.finesView)
        ? prisma.fine.findMany({
            where: { OR: [{ fineNumber: { contains: q, mode: 'insensitive' } }, { offenderLastName: { contains: q, mode: 'insensitive' } }, { offenderFirstName: { contains: q, mode: 'insensitive' } }] },
            take: 8,
            select: { id: true, fineNumber: true, offenderFirstName: true, offenderLastName: true, paymentStatus: true },
          })
        : Promise.resolve([]),
      actor.permissions.has(PERMISSIONS.seizureView)
        ? prisma.seizure.findMany({
            where: { OR: [{ caseNumber: { contains: q, mode: 'insensitive' } }, { suspectLastName: { contains: q, mode: 'insensitive' } }, { suspectFirstName: { contains: q, mode: 'insensitive' } }] },
            take: 8,
            select: { id: true, caseNumber: true, suspectFirstName: true, suspectLastName: true },
          })
        : Promise.resolve([]),
      actor.permissions.has(PERMISSIONS.lawsView)
        ? prisma.law.findMany({
            where: { OR: [{ articleNumber: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }] },
            take: 8,
            select: { id: true, articleNumber: true, title: true, status: true },
          })
        : Promise.resolve([]),
    ])
    res.json({ employees, citizens, wanted, fines, seizures, laws })
  }),
)

metaRouter.get(
  '/sync',
  action(async (req, res) => {
    const actor = actorOf(req)
    const query = parseQuery<{ after: number }>(syncSchema, req.query)
    const events = await prisma.changeEvent.findMany({ where: { id: { gt: query.after } }, orderBy: { id: 'asc' }, take: 200 })
    const visible = events.filter((event) => actor.permissions.has(event.permission) || (event.employeeId && event.employeeId === actor.employeeId))
    res.json({ events: visible, latest: events.at(-1)?.id ?? query.after })
  }),
)

metaRouter.get(
  '/notifications',
  action(async (req, res) => {
    const actor = actorOf(req)
    const items = await prisma.notification.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 50 })
    res.json({ items })
  }),
)

metaRouter.post(
  '/notifications/read-all',
  action(async (req, res) => {
    const actor = actorOf(req)
    await prisma.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } })
    res.json({ ok: true })
  }),
)

metaRouter.post(
  '/notifications/:id/read',
  action(async (req, res) => {
    const actor = actorOf(req)
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: actor.userId }, data: { readAt: new Date() } })
    res.json({ ok: true })
  }),
)
