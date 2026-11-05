import { Router } from 'express'
import { PERMISSIONS, lossActionSchema, lossCreateSchema, lossLinkSchema, recordListSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { nextNumber } from '../lib/numbers'
import { prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'
import { applyStockDelta } from '../services/armory'

export const lossesRouter = Router()

const statusFor: Record<string, 'investigating' | 'found' | 'returned' | 'stored' | 'written_off' | 'closed'> = {
  investigating: 'investigating',
  found: 'found',
  returned: 'returned',
  stored: 'stored',
  written_off: 'written_off',
  closed: 'closed',
}

lossesRouter.get(
  '/',
  requirePermission(PERMISSIONS.lossViewOwn),
  action(async (req, res) => {
    const actor = actorOf(req)
    const query = parseQuery<{ page: number; pageSize: number; q: string; sort: string; dir: 'asc' | 'desc'; status: string }>(recordListSchema, req.query)
    const where: Prisma.LossRecordWhereInput = {}
    if (!actor.permissions.has(PERMISSIONS.lossViewAll)) {
      if (!actor.employeeId) {
        res.json({ items: [], page: query.page, pageSize: query.pageSize, total: 0 })
        return
      }
      where.responsibleEmployeeId = actor.employeeId
    }
    if (query.status) where.status = query.status as Prisma.LossRecordWhereInput['status']
    if (query.q) {
      where.OR = [
        { caseNumber: { contains: query.q, mode: 'insensitive' } },
        { itemName: { contains: query.q, mode: 'insensitive' } },
        { serialNumber: { contains: query.q, mode: 'insensitive' } },
        { responsibleName: { contains: query.q, mode: 'insensitive' } },
        { responsibleBadge: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.lossRecord.count({ where }),
      prisma.lossRecord.findMany({ where, orderBy: { discoveredAt: 'desc' }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

lossesRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.lossViewOwn),
  action(async (req, res) => {
    const actor = actorOf(req)
    const loss = await prisma.lossRecord.findUnique({ where: { id: req.params.id }, include: { actions: { orderBy: { createdAt: 'desc' } } } })
    if (!loss) throw new HttpError(404, 'NOT_FOUND', 'Запись не найдена.')
    if (!actor.permissions.has(PERMISSIONS.lossViewAll) && loss.responsibleEmployeeId !== actor.employeeId) {
      throw new HttpError(404, 'NOT_FOUND', 'Запись не найдена.')
    }
    res.json(loss)
  }),
)

lossesRouter.post(
  '/',
  requirePermission(PERMISSIONS.lossManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof lossCreateSchema.parse>>(lossCreateSchema, req.body)
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const responsible = body.responsibleEmployeeId ? await tx.employee.findUnique({ where: { id: body.responsibleEmployeeId } }) : null
      if (body.responsibleEmployeeId && !responsible) throw new HttpError(400, 'EMPLOYEE', 'Ответственный сотрудник не найден.')
      const reviewer = actor.employeeId ? await tx.employee.findUnique({ where: { id: actor.employeeId } }) : null
      const stockItem = body.inventoryItemId ? await tx.inventoryItem.findUnique({ where: { id: body.inventoryItemId } }) : null
      if (body.inventoryItemId && (!stockItem || stockItem.archived)) throw new HttpError(400, 'ITEM', 'Карточка склада не найдена.')
      const loss = await tx.lossRecord.create({
        data: {
          caseNumber: await nextNumber(tx, 'loss', 'LS'),
          itemName: stockItem?.name ?? body.itemName,
          category: stockItem?.category ?? body.category,
          quantity: body.quantity,
          serialNumber: body.serialNumber || stockItem?.serialNumber || null,
          responsibleEmployeeId: responsible?.id,
          responsibleName: responsible ? `${responsible.firstName} ${responsible.lastName}` : '',
          responsibleBadge: responsible?.badgeNumber ?? '',
          discoveredAt: new Date(body.discoveredAt),
          description: body.description,
          equipmentIssueId: body.equipmentIssueId || null,
          inventoryItemId: stockItem?.id ?? null,
          reviewerId: reviewer?.id,
          reviewerName: actor.name,
          actions: { create: { type: 'created', toStatus: 'open', notes: body.description, actorId: actor.userId, actorName: actor.name } },
        },
      })
      await audit(tx, actor, { action: 'loss.create', module: 'loss', recordId: loss.id, newValues: { caseNumber: loss.caseNumber, itemName: loss.itemName } })
      await changed(tx, effects, { module: 'loss', action: 'loss.create', recordId: loss.id, permission: PERMISSIONS.lossViewAll, employeeId: responsible?.id })
      return loss
    })
    res.status(201).json(created)
  }),
)

lossesRouter.post(
  '/:id/link',
  requirePermission(PERMISSIONS.lossManage),
  action(async (req, res) => {
    const body = parseBody<{ version: number; inventoryItemId: string }>(lossLinkSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const loss = await tx.lossRecord.findUnique({ where: { id: req.params.id } })
      if (!loss) throw new HttpError(404, 'NOT_FOUND', 'Запись не найдена.')
      if (loss.version !== body.version) throw conflict()
      if (loss.stockAdjusted) throw new HttpError(409, 'STOCK', 'Остаток уже изменён, карточку склада менять нельзя.')
      const item = await tx.inventoryItem.findUnique({ where: { id: body.inventoryItemId } })
      if (!item || item.archived) throw new HttpError(400, 'ITEM', 'Карточка склада не найдена.')
      const saved = await tx.lossRecord.updateMany({
        where: { id: loss.id, version: loss.version },
        data: {
          inventoryItemId: item.id,
          itemName: item.name,
          category: item.category,
          serialNumber: loss.serialNumber || item.serialNumber,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      await tx.lossAction.create({
        data: { lossId: loss.id, type: 'linked', fromStatus: loss.status, toStatus: loss.status, notes: item.name, actorId: actor.userId, actorName: actor.name },
      })
      await audit(tx, actor, {
        action: 'loss.update',
        module: 'loss',
        recordId: loss.id,
        oldValues: { inventoryItemId: loss.inventoryItemId, itemName: loss.itemName },
        newValues: { inventoryItemId: item.id, itemName: item.name },
        reason: 'Привязка к карточке склада',
      })
      await changed(tx, effects, { module: 'loss', action: 'loss.update', recordId: loss.id, permission: PERMISSIONS.lossViewAll, employeeId: loss.responsibleEmployeeId })
      return tx.lossRecord.findUniqueOrThrow({ where: { id: loss.id } })
    })
    res.json(updated)
  }),
)

lossesRouter.post(
  '/:id/action',
  requirePermission(PERMISSIONS.lossManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof lossActionSchema.parse>>(lossActionSchema, req.body)
    const actor = actorOf(req)
    const updated = await run(async (tx, effects) => {
      const loss = await tx.lossRecord.findUnique({ where: { id: req.params.id } })
      if (!loss) throw new HttpError(404, 'NOT_FOUND', 'Запись не найдена.')
      if (loss.version !== body.version) throw conflict()
      const next = statusFor[body.action]
      let stockAdjusted = loss.stockAdjusted
      const returnsToShelf = body.returnToStock && (body.action === 'returned' || body.action === 'stored' || body.action === 'found')
      if (returnsToShelf) {
        if (!loss.inventoryItemId) throw new HttpError(400, 'STOCK', 'Сначала привяжите карточку склада. Без неё остаток изменить нельзя.')
        if (loss.stockAdjusted) throw new HttpError(409, 'STOCK', 'Остаток по этой записи уже менялся.')
        await applyStockDelta(tx, actor, {
          itemId: loss.inventoryItemId,
          delta: loss.quantity,
          reason: `Утеря ${loss.caseNumber}: возврат на склад`,
          refType: 'loss',
          refId: loss.id,
        })
        stockAdjusted = true
        if (loss.equipmentIssueId) {
          await tx.equipmentIssue.updateMany({
            where: { id: loss.equipmentIssueId, status: 'issued' },
            data: { status: 'returned', returnedAt: new Date(), quantity: 0, version: { increment: 1 } },
          })
        }
      }
      const closed = next === 'closed' || next === 'written_off' || next === 'returned'
      const saved = await tx.lossRecord.updateMany({
        where: { id: loss.id, version: loss.version },
        data: {
          status: next,
          stockAdjusted,
          closedAt: closed ? new Date() : loss.closedAt,
          closeReason: closed ? body.notes : loss.closeReason,
          reviewerName: actor.name,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      await tx.lossAction.create({
        data: { lossId: loss.id, type: body.action, fromStatus: loss.status, toStatus: next, notes: body.notes, actorId: actor.userId, actorName: actor.name },
      })
      await audit(tx, actor, {
        action: 'loss.update',
        module: 'loss',
        recordId: loss.id,
        oldValues: { status: loss.status },
        newValues: { status: next, stockAdjusted },
        reason: body.notes,
      })
      await changed(tx, effects, { module: 'loss', action: 'loss.update', recordId: loss.id, permission: PERMISSIONS.lossViewAll, employeeId: loss.responsibleEmployeeId })
      return tx.lossRecord.findUniqueOrThrow({ where: { id: loss.id }, include: { actions: { orderBy: { createdAt: 'desc' } } } })
    })
    res.json(updated)
  }),
)
