import { Router } from 'express'
import {
  PERMISSIONS,
  assertRequestTransition,
  recordListSchema,
  requestCreateSchema,
  requestIssueSchema,
  requestReviewSchema,
  StockError,
} from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { beginIdempotency, finishIdempotency, savedIdempotent } from '../lib/idempotency'
import { nextNumber } from '../lib/numbers'
import { audience, enqueueNotice } from '../lib/notify'
import { isUniqueViolation, prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'
import { issueEquipment } from '../services/armory'

export const requestsRouter = Router()

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает рассмотрения',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  issued: 'Выдано',
  closed: 'Закрыт',
}

requestsRouter.get(
  '/',
  requirePermission(PERMISSIONS.requestsCreate),
  action(async (req, res) => {
    const actor = actorOf(req)
    const query = parseQuery<{ page: number; pageSize: number; q: string; dir: 'asc' | 'desc'; status: string }>(recordListSchema, req.query)
    const where: Prisma.EquipmentRequestWhereInput = {}
    if (!actor.permissions.has(PERMISSIONS.requestsReview)) {
      if (!actor.employeeId) {
        res.json({ items: [], page: query.page, pageSize: query.pageSize, total: 0 })
        return
      }
      where.employeeId = actor.employeeId
    }
    if (query.status) where.status = query.status as Prisma.EquipmentRequestWhereInput['status']
    if (query.q) {
      where.OR = [
        { requestNumber: { contains: query.q, mode: 'insensitive' } },
        { requesterName: { contains: query.q, mode: 'insensitive' } },
        { badgeNumber: { contains: query.q, mode: 'insensitive' } },
        { itemName: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.equipmentRequest.count({ where }),
      prisma.equipmentRequest.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

requestsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.requestsCreate),
  action(async (req, res) => {
    const actor = actorOf(req)
    const request = await prisma.equipmentRequest.findUnique({
      where: { id: req.params.id },
      include: { events: { orderBy: { createdAt: 'desc' } }, issue: true },
    })
    if (!request) throw new HttpError(404, 'NOT_FOUND', 'Запрос не найден.')
    if (!actor.permissions.has(PERMISSIONS.requestsReview) && request.employeeId !== actor.employeeId) {
      throw new HttpError(404, 'NOT_FOUND', 'Запрос не найден.')
    }
    res.json(request)
  }),
)

requestsRouter.post(
  '/',
  requirePermission(PERMISSIONS.requestsCreate),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof requestCreateSchema.parse>>(requestCreateSchema, req.body)
    const actor = actorOf(req)
    const employeeId = actor.permissions.has(PERMISSIONS.requestsReview) && body.employeeId ? body.employeeId : actor.employeeId
    if (!employeeId) throw new HttpError(400, 'EMPLOYEE', 'К учётной записи не привязана карточка сотрудника.')
    const created = await run(async (tx, effects) => {
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, include: { user: true } })
      if (!employee || employee.archivedAt) throw new HttpError(400, 'EMPLOYEE', 'Сотрудник не найден.')
      if (body.inventoryItemId) {
        const item = await tx.inventoryItem.findUnique({ where: { id: body.inventoryItemId } })
        if (!item || item.archived) throw new HttpError(400, 'ITEM', 'Предмет склада не найден.')
      }
      const request = await tx.equipmentRequest.create({
        data: {
          requestNumber: await nextNumber(tx, 'request', 'EQ'),
          employeeId: employee.id,
          requesterName: `${employee.firstName} ${employee.lastName}`,
          badgeNumber: employee.badgeNumber,
          itemName: body.itemName,
          inventoryItemId: body.inventoryItemId,
          quantity: body.quantity,
          reason: body.reason,
          comment: body.comment,
          events: { create: { type: 'created', toStatus: 'pending', actorId: actor.userId, actorName: actor.name } },
        },
      })
      const listeners = await audience(PERMISSIONS.requestsReview)
      await enqueueNotice(tx, effects, {
        dedupeKey: `equipment_request.created:${request.id}`,
        kind: 'equipment_request.created',
        title: 'Новый запрос снаряжения',
        body: `${request.requesterName}, табельный ${request.badgeNumber}: ${request.itemName} × ${request.quantity}. ${request.reason}`,
        discordTitle: 'SHERIFF DEPARTMENT — NEW EQUIPMENT REQUEST',
        discordBody: 'Open MDT to review this request.',
        module: 'requests',
        recordId: request.id,
        userIds: listeners.userIds,
        discordIds: listeners.discordIds,
        fields: {
          Deputy: request.requesterName,
          'Badge Number': request.badgeNumber,
          'Requested Item': request.itemName,
          Quantity: request.quantity,
          Reason: request.reason,
          'Request ID': `#${request.requestNumber}`,
          Status: 'Pending Review',
        },
      })
      await audit(tx, actor, { action: 'request.create', module: 'requests', recordId: request.id, newValues: { requestNumber: request.requestNumber, quantity: request.quantity } })
      await changed(tx, effects, { module: 'requests', action: 'request.create', recordId: request.id, permission: PERMISSIONS.requestsReview, employeeId: employee.id })
      return request
    })
    res.status(201).json(created)
  }),
)

requestsRouter.post(
  '/:id/review',
  requirePermission(PERMISSIONS.requestsReview),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof requestReviewSchema.parse>>(requestReviewSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const current = await tx.equipmentRequest.findUnique({ where: { id: req.params.id }, include: { employee: { include: { user: true } } } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Запрос не найден.')
      if (current.version !== body.version) throw conflict()
      try {
        assertRequestTransition(current.status, body.decision)
      } catch (error) {
        if (error instanceof StockError) throw new HttpError(409, error.code, 'Этот запрос уже обработан.')
        throw error
      }
      const saved = await tx.equipmentRequest.updateMany({
        where: { id: current.id, version: current.version, status: current.status },
        data: {
          status: body.decision,
          inventoryItemId: body.inventoryItemId ?? current.inventoryItemId,
          reviewedById: actor.userId,
          reviewerName: actor.name,
          reviewComment: body.comment,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict('Этот запрос уже обработан.')
      await tx.requestEvent.create({
        data: { requestId: current.id, type: 'review', fromStatus: current.status, toStatus: body.decision, comment: body.comment, actorId: actor.userId, actorName: actor.name },
      })
      const requester = current.employee.user
      if (requester && (body.decision === 'approved' || body.decision === 'rejected')) {
        await enqueueNotice(tx, effects, {
          dedupeKey: `equipment_request.reviewed:${current.id}:${body.decision}`,
          kind: 'equipment_request.reviewed',
          title: body.decision === 'approved' ? 'Запрос снаряжения одобрен' : 'Запрос снаряжения отклонён',
          body: `${current.requestNumber}: ${current.itemName} × ${current.quantity}. ${body.comment}`,
          module: 'requests',
          recordId: current.id,
          userIds: [requester.id],
          discordIds: [requester.discordId],
          fields: {
            'Сотрудник': current.requesterName,
            'Табельный номер': current.badgeNumber,
            'Предмет': current.itemName,
            'Количество': current.quantity,
            'Причина': current.reason,
            'Номер запроса': current.requestNumber,
            'Статус': STATUS_LABEL[body.decision] ?? body.decision,
            'Комментарий': body.comment,
          },
        })
      }
      await audit(tx, actor, { action: 'request.review', module: 'requests', recordId: current.id, reason: body.comment, oldValues: { status: current.status }, newValues: { status: body.decision } })
      await changed(tx, effects, { module: 'requests', action: 'request.review', recordId: current.id, permission: PERMISSIONS.requestsReview, employeeId: current.employeeId })
      return tx.equipmentRequest.findUniqueOrThrow({ where: { id: current.id } })
    })
    res.json(updated)
  }),
)

requestsRouter.post(
  '/:id/issue',
  requirePermission(PERMISSIONS.requestsReview),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof requestIssueSchema.parse>>(requestIssueSchema, req.body)
    const actor = actorOf(req)
    try {
      const updated = await run(async (tx, effects) => {
        const idem = await beginIdempotency(tx, actor.userId, 'request.issue', body.idempotencyKey ?? req.params.id)
        const current = await tx.equipmentRequest.findUnique({ where: { id: req.params.id }, include: { employee: { include: { user: true } } } })
        if (!current) throw new HttpError(404, 'NOT_FOUND', 'Запрос не найден.')
        if (current.version !== body.version) throw conflict()
        try {
          assertRequestTransition(current.status, 'issued')
        } catch (error) {
          if (error instanceof StockError) throw new HttpError(409, 'STATE', 'Выдать можно только одобренный запрос, который ещё не выдан.')
          throw error
        }
        const claimed = await tx.equipmentRequest.updateMany({
          where: { id: current.id, status: 'approved', version: current.version },
          data: { status: 'issued', issuedAt: new Date(), inventoryItemId: body.inventoryItemId, version: { increment: 1 } },
        })
        if (claimed.count !== 1) throw conflict('Этот запрос уже выдан или больше не одобрен.')
        const issue = await issueEquipment(tx, effects, actor, {
          itemId: body.inventoryItemId,
          employeeId: current.employeeId,
          quantity: current.quantity,
          serialNumber: body.serialNumber,
          notes: body.notes || current.reviewComment,
          requestId: current.id,
        })
        await tx.requestEvent.create({
          data: { requestId: current.id, type: 'issued', fromStatus: 'approved', toStatus: 'issued', comment: body.notes, actorId: actor.userId, actorName: actor.name },
        })
        const requester = current.employee.user
        if (requester) {
          await enqueueNotice(tx, effects, {
            dedupeKey: `equipment_request.issued:${current.id}`,
            kind: 'equipment_request.issued',
            title: 'Снаряжение выдано',
            body: `${current.requestNumber}: ${current.itemName} × ${current.quantity} выдано и списано со склада.`,
            module: 'requests',
            recordId: current.id,
            userIds: [requester.id],
            discordIds: [requester.discordId],
            fields: {
              'Сотрудник': current.requesterName,
              'Табельный номер': current.badgeNumber,
              'Предмет': current.itemName,
              'Количество': current.quantity,
              'Номер запроса': current.requestNumber,
              'Статус': STATUS_LABEL.issued,
            },
          })
        }
        await audit(tx, actor, { action: 'request.issue', module: 'requests', recordId: current.id, newValues: { issueId: issue.id, quantity: current.quantity } })
        await changed(tx, effects, { module: 'requests', action: 'request.issue', recordId: current.id, permission: PERMISSIONS.requestsReview, employeeId: current.employeeId })
        const fresh = await tx.equipmentRequest.findUniqueOrThrow({ where: { id: current.id }, include: { issue: true } })
        await finishIdempotency(tx, idem, fresh)
        return fresh
      })
      res.json(updated)
    } catch (error) {
      if (isUniqueViolation(error)) {
        const saved = await savedIdempotent(actor.userId, 'request.issue', body.idempotencyKey ?? req.params.id)
        if (saved) {
          res.json(saved)
          return
        }
      }
      throw error
    }
  }),
)
