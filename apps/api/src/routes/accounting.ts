import { Router } from 'express'
import { PERMISSIONS, financeCategorySchema, financeEntrySchema, reportQuerySchema, zonedEnd, zonedStart } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { config } from '../config'
import { toCsv } from '../lib/csv'
import { HttpError, action } from '../lib/http'
import { beginIdempotency, finishIdempotency, savedIdempotent } from '../lib/idempotency'
import { isUniqueViolation, prisma, run } from '../lib/prisma'
import { parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'
import { postEntry } from '../services/ledger'

export const accountingRouter = Router()

function rangeFrom(query: { preset: 'day' | 'week' | 'month' | 'custom'; from?: string; to?: string }) {
  if (query.preset === 'custom') {
    if (!query.from || !query.to) throw new HttpError(400, 'RANGE', 'Укажите начало и конец периода.')
    return { from: new Date(query.from), to: new Date(query.to) }
  }
  const from = zonedStart(new Date(), config.tzOffsetMinutes, query.preset)
  return { from, to: zonedEnd(from, query.preset, config.tzOffsetMinutes) }
}

async function totals(where: Prisma.FinanceEntryWhereInput) {
  const grouped = await prisma.financeEntry.groupBy({ by: ['direction'], where, _sum: { amountCents: true } })
  const incomeCents = grouped.find((row) => row.direction === 'in')?._sum.amountCents ?? 0
  const expenseCents = grouped.find((row) => row.direction === 'out')?._sum.amountCents ?? 0
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents }
}

accountingRouter.get(
  '/balance',
  requirePermission(PERMISSIONS.accountingView),
  action(async (_req, res) => {
    res.json(await totals({}))
  }),
)

accountingRouter.get(
  '/categories',
  requirePermission(PERMISSIONS.accountingView),
  action(async (_req, res) => {
    const items = await prisma.financeCategory.findMany({ where: { active: true }, orderBy: [{ direction: 'asc' }, { name: 'asc' }] })
    res.json({ items })
  }),
)

accountingRouter.post(
  '/categories',
  requirePermission(PERMISSIONS.accountingManage),
  action(async (req, res) => {
    const body = parseBody<{ name: string; direction: 'in' | 'out' }>(financeCategorySchema, req.body)
    const actor = actorOf(req)
    const category = await run(async (tx) => {
      const created = await tx.financeCategory.create({ data: { name: body.name, direction: body.direction } })
      await tx.auditLog.create({
        data: { actorId: actor.userId, actorName: actor.name, discordId: actor.discordId, action: 'finance.category', module: 'accounting', recordId: created.id, newValues: body, ip: actor.ip },
      })
      return created
    })
    res.status(201).json(category)
  }),
)

accountingRouter.get(
  '/entries',
  requirePermission(PERMISSIONS.accountingView),
  action(async (req, res) => {
    const query = parseQuery<{ preset: 'day' | 'week' | 'month' | 'custom'; from?: string; to?: string; categoryId: string; direction: 'in' | 'out' | '' }>(reportQuerySchema, req.query)
    const range = rangeFrom(query)
    const where: Prisma.FinanceEntryWhereInput = { occurredAt: { gte: range.from, lt: range.to } }
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.direction) where.direction = query.direction
    const [items, summary, balance] = await Promise.all([
      prisma.financeEntry.findMany({ where, include: { category: true, employee: true }, orderBy: { occurredAt: 'desc' }, take: 2000 }),
      totals(where),
      totals({}),
    ])
    res.json({ from: range.from, to: range.to, items, summary, balance, currencyCode: items[0]?.currencyCode ?? 'USD' })
  }),
)

accountingRouter.get(
  '/export',
  requirePermission(PERMISSIONS.accountingView),
  action(async (req, res) => {
    const query = parseQuery<{ preset: 'day' | 'week' | 'month' | 'custom'; from?: string; to?: string; categoryId: string; direction: 'in' | 'out' | '' }>(reportQuerySchema, req.query)
    const range = rangeFrom(query)
    const where: Prisma.FinanceEntryWhereInput = { occurredAt: { gte: range.from, lt: range.to } }
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.direction) where.direction = query.direction
    const items = await prisma.financeEntry.findMany({ where, include: { category: true }, orderBy: { occurredAt: 'asc' }, take: 5000 })
    const csv = toCsv([
      ['Номер', 'Дата', 'Направление', 'Сумма в центах', 'Валюта', 'Категория', 'Описание', 'Автор', 'Документ'],
      ...items.map((item) => [
        item.entryNumber,
        item.occurredAt.toISOString(),
        item.direction === 'in' ? 'доход' : 'расход',
        String(item.amountCents),
        item.currencyCode,
        item.category.name,
        item.description,
        item.authorName,
        item.documentRef,
      ]),
    ])
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ledger.csv"')
    res.send(csv)
  }),
)

accountingRouter.post(
  '/entries',
  requirePermission(PERMISSIONS.accountingManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof financeEntrySchema.parse>>(financeEntrySchema, req.body)
    const actor = actorOf(req)
    try {
      const entry = await run(async (tx, effects) => {
        const idem = await beginIdempotency(tx, actor.userId, 'finance', body.idempotencyKey)
        const created = await postEntry(tx, effects, actor, {
          direction: body.direction,
          amountCents: body.amountCents,
          categoryId: body.categoryId,
          description: body.description,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
          employeeId: body.employeeId,
          documentRef: body.documentRef,
          sourceKey: body.idempotencyKey ? `manual:${actor.userId}:${body.idempotencyKey}` : undefined,
          sourceType: 'manual',
        })
        await finishIdempotency(tx, idem, created)
        return created
      })
      res.status(201).json(entry)
    } catch (error) {
      if (body.idempotencyKey && isUniqueViolation(error)) {
        const saved = await savedIdempotent(actor.userId, 'finance', body.idempotencyKey)
        if (saved) {
          res.json(saved)
          return
        }
      }
      throw error
    }
  }),
)
