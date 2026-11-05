import { Router } from 'express'
import { PERMISSIONS, lawCsvImportSchema, lawImportSchema, lawUpsertSchema, recordListSchema, parseMoneyToCents } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { parseCsv } from '../lib/csv'
import { conflict, HttpError, action } from '../lib/http'
import { prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { actorOf, requirePermission } from '../middleware/auth'

export const lawsRouter = Router()

function snapshot(law: {
  articleNumber: string
  title: string
  category: string
  grade: string
  description: string
  conditions: string
  fineMinCents: number
  fineCents: number
  jailMin: number
  jailDays: number
  additionalPenalties: string
  status: string
}) {
  return {
    articleNumber: law.articleNumber,
    title: law.title,
    category: law.category,
    grade: law.grade,
    description: law.description,
    conditions: law.conditions,
    fineMinCents: law.fineMinCents,
    fineCents: law.fineCents,
    jailMin: law.jailMin,
    jailDays: law.jailDays,
    additionalPenalties: law.additionalPenalties,
    status: law.status,
  }
}

lawsRouter.get(
  '/',
  requirePermission(PERMISSIONS.lawsView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; sort: string; dir: 'asc' | 'desc'; status: string; category: string }>(recordListSchema, req.query)
    const where: Prisma.LawWhereInput = {}
    if (query.status) where.status = query.status as Prisma.LawWhereInput['status']
    if (query.category) where.category = query.category
    const grade = typeof req.query.grade === 'string' ? req.query.grade : ''
    if (grade === 'i' || grade === 'm' || grade === 'f') where.grade = grade
    if (grade === 'none') where.grade = ''
    if (query.q) {
      where.OR = [
        { articleNumber: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items, categories] = await Promise.all([
      prisma.law.count({ where }),
      prisma.law.findMany({
        where,
        orderBy: query.sort === 'title' ? { title: query.dir } : [{ sortOrder: 'asc' }, { articleNumber: 'asc' }],
        ...paging(query),
      }),
      prisma.law.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    ])
    res.json({ items, categories: categories.map((row) => row.category), page: query.page, pageSize: query.pageSize, total })
  }),
)

lawsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.lawsView),
  action(async (req, res) => {
    const law = await prisma.law.findUnique({ where: { id: req.params.id }, include: { revisions: { orderBy: { createdAt: 'desc' }, take: 50 } } })
    if (!law) throw new HttpError(404, 'NOT_FOUND', 'Статья не найдена.')
    res.json(law)
  }),
)

lawsRouter.post(
  '/',
  requirePermission(PERMISSIONS.lawsEdit),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof lawUpsertSchema.parse>>(lawUpsertSchema, req.body)
    if (body.status === 'repealed' && !actorOf(req).permissions.has(PERMISSIONS.lawsManage)) {
      throw new HttpError(403, 'FORBIDDEN', 'Отменять статью может только уполномоченный сотрудник.')
    }
    const actor = actorOf(req)
    const created = await run(async (tx, effects) => {
      const law = await tx.law.create({
        data: {
          articleNumber: body.articleNumber,
          title: body.title,
          category: body.category,
          grade: body.grade,
          description: body.description,
          conditions: body.conditions,
          fineMinCents: body.fineMinCents,
          fineCents: body.fineCents,
          jailMin: body.jailMin,
          jailDays: body.jailDays,
          additionalPenalties: body.additionalPenalties,
          status: body.status,
        },
      })
      await tx.lawRevision.create({ data: { lawId: law.id, snapshot: snapshot(law), reason: body.reason || 'Создание статьи', actorId: actor.userId, actorName: actor.name } })
      await audit(tx, actor, { action: 'law.create', module: 'laws', recordId: law.id, newValues: snapshot(law), reason: body.reason })
      await changed(tx, effects, { module: 'laws', action: 'law.create', recordId: law.id, permission: PERMISSIONS.lawsView })
      return law
    })
    res.status(201).json(created)
  }),
)

lawsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.lawsEdit),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof lawUpsertSchema.parse>>(lawUpsertSchema, req.body)
    const actor = actorOf(req)
    if (!body.version) throw new HttpError(400, 'VERSION', 'Обновите карточку статьи и повторите сохранение.')
    if (body.reason.trim().length < 3) throw new HttpError(400, 'REASON', 'Укажите причину изменения закона.')
    const updated = await run(async (tx, effects) => {
      const current = await tx.law.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Статья не найдена.')
      if (current.version !== body.version) throw conflict()
      if ((body.status === 'repealed' || current.status === 'repealed') && !actor.permissions.has(PERMISSIONS.lawsManage)) {
        throw new HttpError(403, 'FORBIDDEN', 'Менять статус отменённой статьи может только уполномоченный сотрудник.')
      }
      const saved = await tx.law.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          articleNumber: body.articleNumber,
          title: body.title,
          category: body.category,
          grade: body.grade,
          description: body.description,
          conditions: body.conditions,
          fineMinCents: body.fineMinCents,
          fineCents: body.fineCents,
          jailMin: body.jailMin,
          jailDays: body.jailDays,
          additionalPenalties: body.additionalPenalties,
          status: body.status,
          version: { increment: 1 },
        },
      })
      if (saved.count !== 1) throw conflict()
      const fresh = await tx.law.findUniqueOrThrow({ where: { id: current.id } })
      await tx.lawRevision.create({ data: { lawId: current.id, snapshot: snapshot(current), reason: body.reason, actorId: actor.userId, actorName: actor.name } })
      await audit(tx, actor, { action: 'law.update', module: 'laws', recordId: current.id, oldValues: snapshot(current), newValues: snapshot(fresh), reason: body.reason })
      await changed(tx, effects, { module: 'laws', action: 'law.update', recordId: current.id, permission: PERMISSIONS.lawsView })
      return fresh
    })
    res.json(updated)
  }),
)

lawsRouter.post(
  '/import',
  requirePermission(PERMISSIONS.lawsManage),
  action(async (req, res) => {
    const body = parseBody<{ mode: 'create' | 'upsert'; laws: ReturnType<typeof lawUpsertSchema.parse>[] }>(lawImportSchema, req.body)
    const actor = actorOf(req)
    const result = await importLaws(actor, body.mode, body.laws)
    res.json(result)
  }),
)

lawsRouter.post(
  '/import-csv',
  requirePermission(PERMISSIONS.lawsManage),
  action(async (req, res) => {
    const body = parseBody<{ mode: 'create' | 'upsert'; csv: string }>(lawCsvImportSchema, req.body)
    const rows = parseCsv(body.csv)
    if (!rows.length) throw new HttpError(400, 'CSV', 'В файле нет строк.')
    const laws = rows.map((row, index) => {
      try {
        const status = lawStatus(pick(row, 'status', 'статус'))
        return lawUpsertSchema.parse({
          articleNumber: pick(row, 'articleNumber', 'номер', 'номер статьи'),
          title: pick(row, 'title', 'название'),
          category: pick(row, 'category', 'категория'),
          description: pick(row, 'description', 'описание') ?? '',
          conditions: pick(row, 'conditions', 'условия') ?? '',
          fineCents: moneyCell(pick(row, 'fineCents', 'штраф', 'сумма')),
          jailDays: Number(pick(row, 'jailDays', 'сутки', 'сроки') || 0),
          additionalPenalties: pick(row, 'additionalPenalties', 'наказания', 'дополнительные наказания') ?? '',
          status,
        })
      } catch {
        throw new HttpError(400, 'CSV', `Строка ${index + 2} заполнена неверно.`)
      }
    })
    res.json(await importLaws(actorOf(req), body.mode, laws))
  }),
)

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const found = Object.keys(row).find((name) => name.trim().toLowerCase() === key)
    if (found !== undefined && row[found] !== '') return row[found]
  }
  return undefined
}

function lawStatus(value: string | undefined): string {
  const name = (value ?? '').trim().toLowerCase()
  if (!name || name === 'active' || name === 'действует') return 'active'
  if (name === 'amended' || name === 'изменена') return 'amended'
  if (name === 'repealed' || name === 'отменена') return 'repealed'
  return value || 'active'
}

function moneyCell(value: string | undefined): number {
  if (!value) return 0
  if (value.includes('.') || value.includes(',')) {
    const cents = parseMoneyToCents(value)
    if (cents === null) throw new HttpError(400, 'CSV', `Сумма «${value}» указана неверно.`)
    return cents
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new HttpError(400, 'CSV', `Сумма «${value}» указана неверно.`)
  return parsed
}

async function importLaws(
  actor: ReturnType<typeof actorOf>,
  mode: 'create' | 'upsert',
  laws: ReturnType<typeof lawUpsertSchema.parse>[],
) {
  return run(async (tx, effects) => {
    let created = 0
    let updated = 0
    for (const law of laws) {
      const existing = await tx.law.findUnique({ where: { articleNumber: law.articleNumber } })
      if (!existing) {
        const row = await tx.law.create({
          data: {
            articleNumber: law.articleNumber,
            title: law.title,
            category: law.category,
            grade: law.grade,
            description: law.description,
            conditions: law.conditions,
            fineMinCents: law.fineMinCents,
            fineCents: law.fineCents,
            jailMin: law.jailMin,
            jailDays: law.jailDays,
            additionalPenalties: law.additionalPenalties,
            status: law.status,
          },
        })
        await tx.lawRevision.create({ data: { lawId: row.id, snapshot: snapshot(row), reason: 'Импорт', actorId: actor.userId, actorName: actor.name } })
        created += 1
        continue
      }
      if (mode === 'create') throw new HttpError(409, 'UNIQUE', `Статья ${law.articleNumber} уже есть. Для обновления выберите режим замены.`)
      await tx.lawRevision.create({ data: { lawId: existing.id, snapshot: snapshot(existing), reason: 'Импорт', actorId: actor.userId, actorName: actor.name } })
      await tx.law.update({
        where: { id: existing.id },
        data: {
          title: law.title,
          category: law.category,
          grade: law.grade,
          description: law.description,
          conditions: law.conditions,
          fineMinCents: law.fineMinCents,
          fineCents: law.fineCents,
          jailMin: law.jailMin,
          jailDays: law.jailDays,
          additionalPenalties: law.additionalPenalties,
          status: law.status,
          version: { increment: 1 },
        },
      })
      updated += 1
    }
    await audit(tx, actor, { action: 'law.import', module: 'laws', newValues: { created, updated, mode } })
    await changed(tx, effects, { module: 'laws', action: 'law.import', recordId: 'import', permission: PERMISSIONS.lawsView })
    return { created, updated }
  })
}
