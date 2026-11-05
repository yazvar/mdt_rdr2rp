import { PERMISSIONS, assertPositiveQuantity, nextQuantity, StockError } from '@mdt/shared'
import type { Actor } from '../lib/actor'
import { audit, changed } from '../lib/audit'
import { HttpError, conflict } from '../lib/http'
import { nextNumber } from '../lib/numbers'
import type { Effects, Tx } from '../lib/prisma'
import { getSettings } from '../lib/settings'
import { postEntry } from './ledger'

export async function applyStockDelta(
  tx: Tx,
  actor: Actor,
  input: { itemId: string; delta: number; reason: string; refType: string; refId: string },
): Promise<number> {
  const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } })
  if (!item || item.archived) throw new HttpError(404, 'NOT_FOUND', 'Предмет склада не найден.')
  let quantity = item.quantityOnHand
  try {
    quantity = nextQuantity(item.quantityOnHand, input.delta)
  } catch (error) {
    if (error instanceof StockError) throw new HttpError(409, error.code, error.message)
    throw error
  }
  const updated = await tx.inventoryItem.updateMany({
    where: { id: item.id, quantityOnHand: item.quantityOnHand, version: item.version },
    data: { quantityOnHand: quantity, version: { increment: 1 } },
  })
  if (updated.count !== 1) throw conflict('Склад изменился одновременно с вашей операцией. Повторите её.')
  await tx.stockMovement.create({
    data: {
      itemId: item.id,
      delta: input.delta,
      quantityAfter: quantity,
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      actorId: actor.userId,
      actorName: actor.name,
    },
  })
  return quantity
}

async function assertSerialFree(tx: Tx, serial: string | null, itemId: string): Promise<void> {
  if (!serial) return
  const issued = await tx.equipmentIssue.findFirst({ where: { serialNumber: serial, status: 'issued' } })
  if (issued) throw new HttpError(409, 'SERIAL', `Серийный номер ${serial} уже числится выданным.`)
  const otherShelf = await tx.inventoryItem.findFirst({
    where: { serialNumber: serial, quantityOnHand: { gt: 0 }, archived: false, NOT: { id: itemId } },
  })
  if (otherShelf) {
    throw new HttpError(409, 'SERIAL', `Серийный номер ${serial} уже есть на складе в другой карточке.`)
  }
}

export async function issueEquipment(
  tx: Tx,
  effects: Effects,
  actor: Actor,
  input: {
    itemId: string
    employeeId: string
    quantity: number
    serialNumber: string | null
    notes: string
    requestId?: string
    demo?: boolean
  },
) {
  try {
    assertPositiveQuantity(input.quantity)
  } catch (error) {
    if (error instanceof StockError) throw new HttpError(400, error.code, error.message)
    throw error
  }
  const [item, employee] = await Promise.all([
    tx.inventoryItem.findUnique({ where: { id: input.itemId } }),
    tx.employee.findUnique({ where: { id: input.employeeId } }),
  ])
  if (!item || item.archived) throw new HttpError(404, 'NOT_FOUND', 'Предмет склада не найден.')
  if (!employee || employee.archivedAt || employee.status === 'dismissed') {
    throw new HttpError(400, 'EMPLOYEE', 'Нельзя выдать снаряжение уволенному или архивному сотруднику.')
  }
  await assertSerialFree(tx, input.serialNumber ?? item.serialNumber, item.id)
  const issuer = actor.employeeId ? await tx.employee.findUnique({ where: { id: actor.employeeId } }) : null
  const issue = await tx.equipmentIssue.create({
    data: {
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      quantity: input.quantity,
      serialNumber: input.serialNumber ?? item.serialNumber,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeBadge: employee.badgeNumber,
      issuedById: issuer?.id,
      issuerName: actor.name,
      notes: input.notes,
      requestId: input.requestId,
      demo: input.demo ?? item.demo,
      status: 'issued',
    },
  })
  await applyStockDelta(tx, actor, {
    itemId: item.id,
    delta: -input.quantity,
    reason: `Выдача ${employee.badgeNumber}`,
    refType: 'equipment_issue',
    refId: issue.id,
  })
  await tx.equipmentMovement.create({
    data: {
      issueId: issue.id,
      type: 'issue',
      quantity: input.quantity,
      toStatus: 'issued',
      notes: input.notes,
      actorId: actor.userId,
      actorName: actor.name,
    },
  })
  const settings = await getSettings()
  if (settings.recognizeEquipmentCost && item.unitCostCents && item.unitCostCents > 0) {
    await postEntry(tx, effects, actor, {
      direction: 'out',
      amountCents: item.unitCostCents * input.quantity,
      categoryName: 'Снаряжение',
      description: `Выдача: ${item.name} × ${input.quantity}, табельный ${employee.badgeNumber}`,
      sourceKey: `issue:${issue.id}:cost`,
      sourceType: 'equipment_issue',
      sourceId: issue.id,
      employeeId: employee.id,
    })
  }
  await audit(tx, actor, {
    action: 'armory.issue',
    module: 'armory',
    recordId: issue.id,
    newValues: { item: item.name, quantity: input.quantity, employeeId: employee.id, badge: employee.badgeNumber },
  })
  await changed(tx, effects, {
    module: 'armory',
    action: 'armory.issue',
    recordId: issue.id,
    permission: PERMISSIONS.armoryViewAll,
    employeeId: employee.id,
  })
  return issue
}

export async function returnEquipment(
  tx: Tx,
  effects: Effects,
  actor: Actor,
  issueId: string,
  input: { version: number; quantity?: number; notes: string },
) {
  const issue = await tx.equipmentIssue.findUnique({ where: { id: issueId } })
  if (!issue) throw new HttpError(404, 'NOT_FOUND', 'Выдача не найдена.')
  if (issue.version !== input.version) throw conflict()
  if (issue.status !== 'issued') throw new HttpError(409, 'STATE', 'Вернуть можно только числящееся выданным снаряжение.')
  if (!issue.itemId) throw new HttpError(400, 'STOCK', 'У выдачи нет карточки склада, остаток некуда вернуть.')
  const quantity = input.quantity ?? issue.quantity
  try {
    assertPositiveQuantity(quantity)
  } catch (error) {
    if (error instanceof StockError) throw new HttpError(400, error.code, error.message)
    throw error
  }
  if (quantity > issue.quantity) throw new HttpError(400, 'QUANTITY', 'Нельзя вернуть больше, чем числится выданным.')
  const full = quantity === issue.quantity
  const updated = await tx.equipmentIssue.updateMany({
    where: { id: issue.id, version: issue.version, status: 'issued' },
    data: full
      ? { status: 'returned', returnedAt: new Date(), quantity: 0, version: { increment: 1 }, notes: input.notes || issue.notes }
      : { quantity: issue.quantity - quantity, version: { increment: 1 } },
  })
  if (updated.count !== 1) throw conflict()
  await applyStockDelta(tx, actor, {
    itemId: issue.itemId,
    delta: quantity,
    reason: `Возврат ${issue.employeeBadge}`,
    refType: 'equipment_issue',
    refId: issue.id,
  })
  await tx.equipmentMovement.create({
    data: {
      issueId: issue.id,
      type: 'return',
      quantity,
      fromStatus: 'issued',
      toStatus: full ? 'returned' : 'issued',
      notes: input.notes,
      actorId: actor.userId,
      actorName: actor.name,
    },
  })
  const settings = await getSettings()
  if (settings.recognizeEquipmentCost) {
    const item = await tx.inventoryItem.findUnique({ where: { id: issue.itemId } })
    if (item?.unitCostCents) {
      await postEntry(tx, effects, actor, {
        direction: 'in',
        amountCents: item.unitCostCents * quantity,
        categoryName: 'Возврат снаряжения',
        description: `Возврат на склад: ${issue.itemName} × ${quantity}`,
        sourceKey: `issue:${issue.id}:return:${issue.quantity}:${quantity}`,
        sourceType: 'equipment_issue',
        sourceId: issue.id,
        employeeId: issue.employeeId,
      })
    }
  }
  await audit(tx, actor, {
    action: 'armory.return',
    module: 'armory',
    recordId: issue.id,
    oldValues: { quantity: issue.quantity, status: issue.status },
    newValues: { returned: quantity, status: full ? 'returned' : 'issued' },
    reason: input.notes,
  })
  await changed(tx, effects, {
    module: 'armory',
    action: 'armory.return',
    recordId: issue.id,
    permission: PERMISSIONS.armoryViewAll,
    employeeId: issue.employeeId,
  })
}

export async function closeIssue(
  tx: Tx,
  effects: Effects,
  actor: Actor,
  issueId: string,
  input: { version: number; status: 'lost' | 'written_off'; notes: string },
) {
  const issue = await tx.equipmentIssue.findUnique({ where: { id: issueId } })
  if (!issue) throw new HttpError(404, 'NOT_FOUND', 'Выдача не найдена.')
  if (issue.version !== input.version || issue.status !== 'issued') throw conflict('Операция уже отражена в реестре.')
  const updated = await tx.equipmentIssue.updateMany({
    where: { id: issue.id, version: issue.version, status: 'issued' },
    data: { status: input.status, version: { increment: 1 }, notes: input.notes },
  })
  if (updated.count !== 1) throw conflict()
  await tx.equipmentMovement.create({
    data: {
      issueId: issue.id,
      type: input.status,
      quantity: issue.quantity,
      fromStatus: 'issued',
      toStatus: input.status,
      notes: input.notes,
      actorId: actor.userId,
      actorName: actor.name,
    },
  })
  if (input.status === 'lost') {
    const caseNumber = await nextNumber(tx, 'loss', 'LS')
    await tx.lossRecord.create({
      data: {
        caseNumber,
        itemName: issue.itemName,
        category: issue.category,
        quantity: issue.quantity,
        serialNumber: issue.serialNumber,
        responsibleEmployeeId: issue.employeeId,
        responsibleName: issue.employeeName,
        responsibleBadge: issue.employeeBadge,
        discoveredAt: new Date(),
        description: input.notes,
        status: 'open',
        equipmentIssueId: issue.id,
        inventoryItemId: issue.itemId,
        demo: issue.demo,
        actions: {
          create: { type: 'opened_from_issue', toStatus: 'open', notes: input.notes, actorId: actor.userId, actorName: actor.name },
        },
      },
    })
  }
  await audit(tx, actor, {
    action: input.status === 'lost' ? 'armory.lost' : 'armory.write_off',
    module: 'armory',
    recordId: issue.id,
    oldValues: { status: 'issued', quantity: issue.quantity },
    newValues: { status: input.status },
    reason: input.notes,
  })
  await changed(tx, effects, {
    module: 'armory',
    action: 'armory.update',
    recordId: issue.id,
    permission: PERMISSIONS.armoryViewAll,
    employeeId: issue.employeeId,
  })
  if (input.status === 'lost') {
    await changed(tx, effects, {
      module: 'loss',
      action: 'loss.create',
      recordId: issue.id,
      permission: PERMISSIONS.lossViewAll,
      employeeId: issue.employeeId,
    })
  }
}
