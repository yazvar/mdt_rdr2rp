import { Router } from 'express'
import {
  PERMISSIONS,
  fineCreateSchema,
  finePaymentSchema,
  formatMoney,
  paymentDelta,
  paymentStatusFor,
  recordListSchema,
  resolveFineAmount,
} from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { audit, changed } from '../lib/audit'
import { conflict, HttpError, action } from '../lib/http'
import { linkedCitizen } from '../lib/citizen'
import { resolveCharges } from '../lib/sentence'
import { beginIdempotency, finishIdempotency, savedIdempotent } from '../lib/idempotency'
import { nextNumber } from '../lib/numbers'
import { isUniqueViolation, prisma, run } from '../lib/prisma'
import { paging, parseBody, parseQuery } from '../lib/validate'
import { getSettings } from '../lib/settings'
import { actorOf, requirePermission } from '../middleware/auth'
import { postEntry } from '../services/ledger'

export const finesRouter = Router()

finesRouter.get(
  '/',
  requirePermission(PERMISSIONS.finesView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string; dir: 'asc' | 'desc'; status: string }>(recordListSchema, req.query)
    const where: Prisma.FineWhereInput = {}
    if (query.status) where.paymentStatus = query.status as Prisma.FineWhereInput['paymentStatus']
    if (typeof req.query.wantedId === 'string' && req.query.wantedId) where.wantedId = req.query.wantedId
    if (query.q) {
      where.OR = [
        { fineNumber: { contains: query.q, mode: 'insensitive' } },
        { offenderFirstName: { contains: query.q, mode: 'insensitive' } },
        { offenderLastName: { contains: query.q, mode: 'insensitive' } },
        { issuerName: { contains: query.q, mode: 'insensitive' } },
        { issuerBadge: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.fine.count({ where }),
      prisma.fine.findMany({ where, include: { charges: true }, orderBy: { issuedAt: 'desc' }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)

finesRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.finesView),
  action(async (req, res) => {
    const fine = await prisma.fine.findUnique({
      where: { id: req.params.id },
      include: { charges: true, events: { orderBy: { createdAt: 'desc' } }, wanted: true },
    })
    if (!fine) throw new HttpError(404, 'NOT_FOUND', 'Штраф не найден.')
    const history = await prisma.fine.findMany({
      where: {
        offenderFirstName: { equals: fine.offenderFirstName, mode: 'insensitive' },
        offenderLastName: { equals: fine.offenderLastName, mode: 'insensitive' },
        NOT: { id: fine.id },
      },
      orderBy: { issuedAt: 'desc' },
      take: 20,
      select: { id: true, fineNumber: true, issuedAt: true, amountCents: true, paymentStatus: true },
    })
    res.json({ ...fine, history })
  }),
)

finesRouter.post(
  '/',
  requirePermission(PERMISSIONS.finesIssue),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof fineCreateSchema.parse>>(fineCreateSchema, req.body)
    const actor = actorOf(req)
    try {
      const created = await run(async (tx, effects) => {
        const idem = await beginIdempotency(tx, actor.userId, 'fine', body.idempotencyKey)
        const resolved = await resolveCharges(tx, { lawIds: body.lawIds, charges: body.charges })
        if (!resolved) throw new HttpError(400, 'LAW', 'Выберите хотя бы одну статью.')
        const summary = resolved.summary
        const amount = resolveFineAmount({
          calculatedCents: summary.fineCents,
          adjustmentCents: body.adjustmentCents,
          adjustmentReason: body.adjustmentReason,
          canAdjust: actor.permissions.has(PERMISSIONS.finesAdjust),
        })
        if (body.wantedId) {
          const wanted = await tx.wantedNotice.findUnique({ where: { id: body.wantedId } })
          if (!wanted) throw new HttpError(400, 'WANTED', 'Связанный розыск не найден.')
        }
        const person = await linkedCitizen(tx, body.citizenId, { firstName: body.offenderFirstName, lastName: body.offenderLastName })
        const officer = actor.employeeId ? await tx.employee.findUnique({ where: { id: actor.employeeId } }) : null
        const fine = await tx.fine.create({
          data: {
            fineNumber: body.fineNumber || await nextNumber(tx, 'fine', 'FN'),
            offenderFirstName: person.firstName,
            offenderLastName: person.lastName,
            citizenId: person.citizenId,
            issuedAt: body.issuedAt ? new Date(body.issuedAt) : new Date(),
            issuedById: officer?.id,
            issuerName: officer ? `${officer.firstName} ${officer.lastName}` : actor.name,
            issuerBadge: officer?.badgeNumber ?? '',
            description: body.description,
            calculatedCents: summary.fineCents,
            amountCents: amount.amountCents,
            adjusted: amount.adjusted,
            adjustmentReason: amount.reason,
            jailDays: summary.jailDays,
            additionalPenalties: summary.additionalPenalties,
            wantedId: body.wantedId,
            charges: {
              create: resolved.chosen.map((row) => ({
                lawId: row.law.id,
                articleNumber: row.law.articleNumber,
                title: row.law.title,
                fineCents: row.fineCents,
                jailDays: row.jailDays,
                additionalPenalties: row.law.additionalPenalties,
              })),
            },
          },
          include: { charges: true },
        })
        await tx.fineEvent.create({
          data: { fineId: fine.id, type: 'created', toValue: fine.fineNumber, reason: amount.reason, actorId: actor.userId, actorName: actor.name },
        })
        await audit(tx, actor, {
          action: 'fine.create',
          module: 'fines',
          recordId: fine.id,
          reason: amount.reason,
          newValues: { fineNumber: fine.fineNumber, amountCents: fine.amountCents, adjusted: fine.adjusted },
        })
        await changed(tx, effects, { module: 'fines', action: 'fine.create', recordId: fine.id, permission: PERMISSIONS.finesView })
        await finishIdempotency(tx, idem, fine)
        return fine
      })
      res.status(201).json(created)
    } catch (error) {
      if (body.idempotencyKey && isUniqueViolation(error)) {
        const saved = await savedIdempotent(actor.userId, 'fine', body.idempotencyKey)
        if (saved) {
          res.json(saved)
          return
        }
      }
      throw error
    }
  }),
)

finesRouter.post(
  '/:id/payment',
  requirePermission(PERMISSIONS.finesManage),
  action(async (req, res) => {
    const body = parseBody<ReturnType<typeof finePaymentSchema.parse>>(finePaymentSchema, req.body)
    const actor = actorOf(req)
    const settings = await getSettings()
    const fine = await run(async (tx, effects) => {
      const current = await tx.fine.findUnique({ where: { id: req.params.id } })
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Штраф не найден.')
      if (current.version !== body.version) throw conflict()
      if (body.action === 'cancel' || body.action === 'reopen' || body.action === 'sentence_cancelled') {
        if (body.reason.trim().length < 3) throw new HttpError(400, 'REASON', 'Укажите причину.')
      }
      let paymentStatus = current.paymentStatus
      let paidCents = current.paidCents
      let sentenceStatus = current.sentenceStatus
      if (body.action === 'mark_paid' || body.action === 'record_payment') {
        if (current.paymentStatus === 'cancelled') throw new HttpError(409, 'STATE', 'Отменённый штраф нельзя оплатить без восстановления.')
        const nextPaid = body.action === 'mark_paid' ? current.amountCents : current.paidCents + (body.amountCents ?? 0)
        if (body.action === 'record_payment' && !body.amountCents) throw new HttpError(400, 'AMOUNT', 'Укажите сумму платежа.')
        if (nextPaid > current.amountCents) throw new HttpError(400, 'AMOUNT', 'Платёж больше суммы штрафа.')
        const delta = paymentDelta(current.paidCents, nextPaid)
        paymentStatus = paymentStatusFor(nextPaid, current.amountCents, false)
        paidCents = nextPaid
        if (delta > 0 && settings.recognizeFineOnPayment) {
          await postEntry(tx, effects, actor, {
            direction: 'in',
            amountCents: delta,
            categoryName: 'Штрафы',
            description: `Оплата штрафа ${current.fineNumber}`,
            sourceKey: `fine:${current.id}:pay:${current.paidCents}:${nextPaid}`,
            sourceType: 'fine',
            sourceId: current.id,
            documentRef: current.fineNumber,
          })
        }
      } else if (body.action === 'cancel') {
        if (current.paidCents > 0 && settings.recognizeFineOnPayment) {
          await postEntry(tx, effects, actor, {
            direction: 'out',
            amountCents: current.paidCents,
            categoryName: 'Прочий расход',
            description: `Отмена оплаты штрафа ${current.fineNumber}`,
            sourceKey: `fine:${current.id}:reversal:${current.paidCents}`,
            sourceType: 'fine',
            sourceId: current.id,
            documentRef: current.fineNumber,
          })
        }
        paymentStatus = 'cancelled'
        sentenceStatus = 'cancelled'
      } else if (body.action === 'reopen') {
        if (current.paymentStatus !== 'cancelled') throw new HttpError(409, 'STATE', 'Восстановить можно только отменённый штраф.')
        paymentStatus = 'unpaid'
        paidCents = 0
        sentenceStatus = 'pending'
      } else if (body.action === 'sentence_served') {
        sentenceStatus = 'served'
      } else if (body.action === 'sentence_cancelled') {
        sentenceStatus = 'cancelled'
      }
      const saved = await tx.fine.updateMany({
        where: { id: current.id, version: current.version },
        data: { paymentStatus, paidCents, sentenceStatus, version: { increment: 1 } },
      })
      if (saved.count !== 1) throw conflict()
      await tx.fineEvent.create({
        data: {
          fineId: current.id,
          type: body.action,
          fromValue: `${current.paymentStatus}/${current.sentenceStatus}`,
          toValue: `${paymentStatus}/${sentenceStatus}`,
          reason: body.reason,
          actorId: actor.userId,
          actorName: actor.name,
        },
      })
      await audit(tx, actor, {
        action: body.action === 'cancel' ? 'fine.cancel' : body.action.startsWith('sentence') ? 'fine.sentence' : 'fine.payment',
        module: 'fines',
        recordId: current.id,
        reason: body.reason,
        oldValues: { paymentStatus: current.paymentStatus, paidCents: current.paidCents, sentenceStatus: current.sentenceStatus },
        newValues: { paymentStatus, paidCents, sentenceStatus },
      })
      await changed(tx, effects, { module: 'fines', action: 'fine.update', recordId: current.id, permission: PERMISSIONS.finesView })
      if (paymentStatus !== current.paymentStatus || sentenceStatus !== current.sentenceStatus) {
        await changed(tx, effects, { module: 'accounting', action: 'fine.update', recordId: current.id, permission: PERMISSIONS.accountingView })
      }
      return tx.fine.findUniqueOrThrow({ where: { id: current.id }, include: { charges: true, events: { orderBy: { createdAt: 'desc' } } } })
    })
    res.json(fine)
  }),
)

finesRouter.get(
  '/:id/document',
  requirePermission(PERMISSIONS.finesView),
  action(async (req, res) => {
    const fine = await prisma.fine.findUnique({ where: { id: req.params.id }, include: { charges: true } })
    if (!fine) throw new HttpError(404, 'NOT_FOUND', 'Штраф не найден.')
    const settings = await getSettings()
    res.json({
      department: settings.departmentName,
      county: settings.countyName,
      motto: settings.motto,
      fineNumber: fine.fineNumber,
      issuedAt: fine.issuedAt,
      offender: `${fine.offenderFirstName} ${fine.offenderLastName}`,
      issuer: fine.issuerName,
      badge: fine.issuerBadge,
      description: fine.description,
      charges: fine.charges,
      amount: formatMoney(fine.amountCents, settings.currencySymbol),
      amountCents: fine.amountCents,
      calculated: formatMoney(fine.calculatedCents, settings.currencySymbol),
      adjusted: fine.adjusted,
      adjustmentReason: fine.adjustmentReason,
      jailDays: fine.jailDays,
      additionalPenalties: fine.additionalPenalties,
      paymentStatus: fine.paymentStatus,
      sentenceStatus: fine.sentenceStatus,
      currencyCode: settings.currencyCode,
    })
  }),
)
