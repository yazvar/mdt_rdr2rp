import { Router } from 'express'
import {
  PERMISSIONS,
  inventoryCreateSchema,
  inventoryDeleteSchema,
  inventoryUpdateSchema,
  issueCreateSchema,
  issueReturnSchema,
  issueStatusSchema,
  recordListSchema,
} from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { beginIdempotency, finishIdempotency, savedIdempotent } from '../lib/idempotency'
import { isUniqueViolation, prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'
import { applyStockDelta, closeIssue, issueEquipment, returnEquipment } from '../services/armory'

export const armoryRouter = Router()

armoryRouter.get(
  '/catalog',
  requirePermission(PERMISSIONS.armoryViewOwn, PERMISSIONS.requestsCreate),
  action(async (req, res) => {
    const actor = actorOf(req)
    const items = await prisma.inventoryItem.findMany({
      where: { archived: false },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, quantityOnHand: true, serialNumber: true, unitCostCents: true },
    })
    const full = actor.permissions.has(PERMISSIONS.armoryViewAll)
    res.json({
      items: items.map((item) => ({
        ...item,
        serialNumber: full ? item.serialNumber : null,
        unitCostCents: full ? item.unitCostCents : null,
      })),
    })
  }),
)

armoryRouter.get(
  '/items',
  requirePermission(PERMISSIONS.armoryViewAll),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; sort: string; dir: 'asc' | 'desc'; category: string }>(recordListSchema, req.query)
    const where: Prisma.InventoryItemWhereInput = { archived: false }
    if (query.category) where.category = query.category
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { category: { contains: query.q, mode: 'insensitive' } },
        { serialNumber: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where,
        orderBy: query.sort === 'quantity' ? { quantityOnHand: query.dir } : { name: 'asc' },
        ...paging(query),
      }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

armoryRouter.post(
  '/items',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof inventoryCreateSchema.parse>>(inventoryCreateSchema, req.body)
    const actor = actorOf(req)
    const item = await run(async (tx, effects) => {
      const created = await tx.inventoryItem.create({
        data: {
          name: body.name,
          category: body.category,
          serialNumber: body.serialNumber,
          quantityOnHand: body.quantity,
          unitCostCents: body.unitCostCents ?? null,
          notes: body.notes,
        },
      })
      await tx.stockMovement.create({
        data: {
          itemId: created.id,
          delta: body.quantity,
          quantityAfter: body.quantity,
          reason: 'Постановка на учёт',
          refType: 'inventory',
          refId: created.id,
          actorId: actor.userId,
          actorName: actor.name,
        },
      })
      await audit(tx, actor, { action: 'inventory.create', module: 'armory', recordId: created.id, newValues: { name: created.name, quantity: body.quantity } })
      await changed(tx, effects, { module: 'armory', action: 'inventory.create', recordId: created.id, permission: PERMISSIONS.armoryViewAll })
      return created
    })
    res.status(201).json(item)
  }),
)

armoryRouter.patch(
  '/items/:id',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof inventoryUpdateSchema.parse>>(inventoryUpdateSchema, req.body)
    const actor = actorOf(req)
    const item = await run(async (tx, effects) => {
      const current = await tx.inventoryItem.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Предмет склада не найден.')
      if (current.version !== body.version) throw conflict()
      const saved = await tx.inventoryItem.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          name: body.name ?? current.name,
          category: body.category ?? current.category,
          serialNumber: body.serialNumber === undefined ? current.serialNumber : body.serialNumber,
          unitCostCents: body.unitCostCents === undefined ? current.unitCostCents : body.unitCostCents,
          notes: body.notes ?? current.notes,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      if (body.quantity !== undefined && body.quantity !== current.quantityOnHand) {
        await applyStockDelta(tx, actor, {
          itemId: current.id,
          delta: body.quantity - current.quantityOnHand,
          reason: 'Корректировка остатка',
          refType: 'inventory',
          refId: current.id,
        })
      }
      await audit(tx, actor, {
        action: 'inventory.update',
        module: 'armory',
        recordId: current.id,
        oldValues: { name: current.name, quantity: current.quantityOnHand },
        newValues: { name: body.name ?? current.name, quantity: body.quantity ?? current.quantityOnHand },
      })
      await changed(tx, effects, { module: 'armory', action: 'inventory.update', recordId: current.id, permission: PERMISSIONS.armoryViewAll })
      return tx.inventoryItem.findUniqueOrThrow({ where: { id: current.id } })
    })
    res.json(item)
  }),
)

armoryRouter.post(
  '/items/:id/archive',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const actor = actorOf(req)
    const item = await run(async (tx, effects) => {
      const current = await tx.inventoryItem.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Предмет склада не найден.')
      await tx.inventoryItem.update({ where: { id: current.id }, data: { archived: true, version: { increment: 1 } } })
      await audit(tx, actor, { action: 'inventory.update', module: 'armory', recordId: current.id, newValues: { archived: true }, reason: 'Снято с действующего склада' })
      await changed(tx, effects, { module: 'armory', action: 'inventory.update', recordId: current.id, permission: PERMISSIONS.armoryViewAll })
      return tx.inventoryItem.findUniqueOrThrow({ where: { id: current.id } })
    })
    res.json(item)
  }),
)

armoryRouter.post(
  '/items/:id/delete',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof inventoryDeleteSchema.parse>>(inventoryDeleteSchema, req.body)
    const actor = actorOf(req)
    await run(async (tx, effects) => {
      const current = await tx.inventoryItem.findUnique({ where: { id: req.params.id } })
      if (!current || current.archived) throw new HttpError(404, 'NOT_FOUND', 'Предмет склада не найден.')
      if (current.version !== body.version) throw conflict()
      const issued = await tx.equipmentIssue.count({ where: { itemId: current.id, status: 'issued' } })
      if (issued > 0) {
        throw new HttpError(409, 'ISSUED', 'Предмет сейчас выдан. Сначала оформите возврат, потом удалите карточку.')
      }
      await tx.equipmentIssue.updateMany({ where: { itemId: current.id }, data: { itemId: null } })
      await tx.equipmentRequest.updateMany({ where: { inventoryItemId: current.id }, data: { inventoryItemId: null } })
      await tx.lossRecord.updateMany({ where: { inventoryItemId: current.id }, data: { inventoryItemId: null } })
      await audit(tx, actor, {
        action: 'inventory.delete',
        module: 'armory',
        recordId: current.id,
        reason: body.reason,
        oldValues: { name: current.name, category: current.category, quantity: current.quantityOnHand, serialNumber: current.serialNumber },
      })
      await tx.inventoryItem.delete({ where: { id: current.id } })
      await changed(tx, effects, { module: 'armory', action: 'inventory.delete', recordId: current.id, permission: PERMISSIONS.armoryViewAll })
    })
    res.json({ ok: true })
  }),
)

armoryRouter.get(
  '/issues',
  requirePermission(PERMISSIONS.armoryViewOwn),
  action(async (req, res) => {
    const actor = actorOf(req)
    const query = parseQuery<{ page: number; pageSize: number; q: string; sort: string; dir: 'asc' | 'desc'; status: string; employeeId: string }>(recordListSchema, req.query)
    const where: Prisma.EquipmentIssueWhereInput = {}
    if (!actor.permissions.has(PERMISSIONS.armoryViewAll)) {
      if (!actor.employeeId) {
        res.json({ items: [], page: query.page, pageSize: query.pageSize, total: 0 })
        return
      }
      where.employeeId = actor.employeeId
    } else if (query.employeeId) where.employeeId = query.employeeId
    if (query.status) where.status = query.status as Prisma.EquipmentIssueWhereInput['status']
    if (query.q) {
      where.OR = [
        { itemName: { contains: query.q, mode: 'insensitive' } },
        { serialNumber: { contains: query.q, mode: 'insensitive' } },
        { employeeName: { contains: query.q, mode: 'insensitive' } },
        { employeeBadge: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.equipmentIssue.count({ where }),
      prisma.equipmentIssue.findMany({ where, orderBy: { issuedAt: query.dir }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

armoryRouter.get(
  '/issues/:id',
  requirePermission(PERMISSIONS.armoryViewOwn),
  action(async (req, res) => {
    const actor = actorOf(req)
    const issue = await prisma.equipmentIssue.findUnique({ where: { id: req.params.id }, include: { movements: { orderBy: { createdAt: 'desc' } } } })
    if (!issue) throw new HttpError(404, 'NOT_FOUND', 'Выдача не найдена.')
    if (!actor.permissions.has(PERMISSIONS.armoryViewAll) && issue.employeeId !== actor.employeeId) {
      throw new HttpError(404, 'NOT_FOUND', 'Выдача не найдена.')
    }
    res.json(issue)
  }),
)

armoryRouter.post(
  '/issues',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof issueCreateSchema.parse>>(issueCreateSchema, req.body)
    const actor = actorOf(req)
    try {
      const issue = await run(async (tx, effects) => {
        const idem = await beginIdempotency(tx, actor.userId, 'armory.issue', body.idempotencyKey)
        const created = await issueEquipment(tx, effects, actor, body)
        await finishIdempotency(tx, idem, created)
        return created
      })
      res.status(201).json(issue)
    } catch (error) {
      if (body.idempotencyKey && isUniqueViolation(error)) {
        const saved = await savedIdempotent(actor.userId, 'armory.issue', body.idempotencyKey)
        if (saved) {
          res.json(saved)
          return
        }
      }
      throw error
    }
  }),
)

armoryRouter.post(
  '/issues/:id/return',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof issueReturnSchema.parse>>(issueReturnSchema, req.body)
    const actor = actorOf(req)
    await run((tx, effects) => returnEquipment(tx, effects, actor, req.params.id, body))
    const issue = await prisma.equipmentIssue.findUnique({ where: { id: req.params.id } })
    res.json(issue)
  }),
)

armoryRouter.post(
  '/issues/:id/status',
  requirePermission(PERMISSIONS.armoryManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof issueStatusSchema.parse>>(issueStatusSchema, req.body)
    const actor = actorOf(req)
    await run((tx, effects) => closeIssue(tx, effects, actor, req.params.id, body))
    const issue = await prisma.equipmentIssue.findUnique({ where: { id: req.params.id } })
    res.json(issue)
  }),
)

armoryRouter.get(
  '/warnings',
  requirePermission(PERMISSIONS.armoryManage, PERMISSIONS.lossManage),
  action(async (_req, res) => {
    const [items, sums, issued] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { archived: false } }),
      prisma.stockMovement.groupBy({ by: ['itemId'], _sum: { delta: true } }),
      prisma.equipmentIssue.findMany({ where: { status: 'issued', serialNumber: { not: null } }, select: { id: true, serialNumber: true, itemName: true, itemId: true } }),
    ])
    const byItem = new Map(sums.map((row) => [row.itemId, row._sum.delta ?? 0]))
    const warnings: { type: string; message: string; itemId?: string; serialNumber?: string }[] = []
    for (const item of items) {
      const ledger = byItem.get(item.id) ?? 0
      if (ledger !== item.quantityOnHand) {
        warnings.push({
          type: 'ledger_mismatch',
          itemId: item.id,
          message: `«${item.name}»: на складе ${item.quantityOnHand}, по журналу движений ${ledger}.`,
        })
      }
    }
    const serialCount = new Map<string, number>()
    for (const row of issued) {
      if (!row.serialNumber) continue
      serialCount.set(row.serialNumber, (serialCount.get(row.serialNumber) ?? 0) + 1)
    }
    for (const [serial, count] of serialCount) {
      if (count > 1) warnings.push({ type: 'duplicate_serial', serialNumber: serial, message: `Серийный номер ${serial} числится выданным ${count} раз.` })
    }
    for (const row of issued) {
      const shelf = items.find((item) => item.serialNumber && item.serialNumber === row.serialNumber && item.quantityOnHand > 0 && item.id !== row.itemId)
      if (shelf) {
        warnings.push({
          type: 'serial_on_shelf',
          serialNumber: row.serialNumber ?? undefined,
          itemId: shelf.id,
          message: `Серийный номер ${row.serialNumber} одновременно числится выданным и лежащим на складе.`,
        })
      }
    }
    res.json({ warnings })
  }),
)
