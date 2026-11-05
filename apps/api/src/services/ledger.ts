import { PERMISSIONS } from '@mdt/shared'
import type { FinanceDirection } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { audit, changed } from '../lib/audit'
import { HttpError } from '../lib/http'
import { nextNumber } from '../lib/numbers'
import { isUniqueViolation, type Effects, type Tx } from '../lib/prisma'
import { getSettings } from '../lib/settings'

export async function postEntry(
  tx: Tx,
  effects: Effects,
  actor: Actor,
  input: {
    direction: FinanceDirection
    amountCents: number
    categoryId?: string
    categoryName?: string
    description: string
    occurredAt?: Date
    employeeId?: string | null
    documentRef?: string
    sourceKey?: string
    sourceType?: string
    sourceId?: string
    demo?: boolean
  },
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new HttpError(400, 'AMOUNT', 'Сумма проводки должна быть больше нуля.')
  }
  let categoryId = input.categoryId
  if (!categoryId) {
    const category = await tx.financeCategory.findFirst({
      where: { name: input.categoryName ?? '', direction: input.direction, active: true },
    })
    if (!category) throw new HttpError(400, 'CATEGORY', `Не найдена категория «${input.categoryName ?? ''}».`)
    categoryId = category.id
  } else {
    const category = await tx.financeCategory.findFirst({ where: { id: categoryId, direction: input.direction, active: true } })
    if (!category) throw new HttpError(400, 'CATEGORY', 'Категория не подходит к типу операции.')
  }
  const settings = await getSettings()
  const entryNumber = await nextNumber(tx, 'finance', 'FC')
  try {
    const entry = await tx.financeEntry.create({
      data: {
        entryNumber,
        direction: input.direction,
        amountCents: input.amountCents,
        currencyCode: settings.currencyCode,
        occurredAt: input.occurredAt ?? new Date(),
        categoryId,
        description: input.description,
        authorId: actor.userId,
        authorName: actor.name,
        employeeId: input.employeeId ?? null,
        documentRef: input.documentRef ?? '',
        sourceKey: input.sourceKey,
        sourceType: input.sourceType ?? '',
        sourceId: input.sourceId ?? '',
        demo: input.demo ?? false,
      },
    })
    await audit(tx, actor, {
      action: 'finance.create',
      module: 'accounting',
      recordId: entry.id,
      newValues: { entryNumber, direction: input.direction, amountCents: input.amountCents, sourceKey: input.sourceKey ?? null },
    })
    await changed(tx, effects, {
      module: 'accounting',
      action: 'finance.create',
      recordId: entry.id,
      permission: PERMISSIONS.accountingView,
    })
    return entry
  } catch (error) {
    if (input.sourceKey && isUniqueViolation(error)) {
      const existing = await tx.financeEntry.findUnique({ where: { sourceKey: input.sourceKey } })
      if (existing) return existing
    }
    throw error
  }
}
