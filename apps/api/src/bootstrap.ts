import { DEFAULT_NOTIFY_EVENTS, DEFAULT_SETTINGS, PERMISSION_CATALOG, ROLE_PRESETS, SETTING_KEYS } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { SERVER_CODE } from './data/code'
import { prisma } from './lib/prisma'

const RANKS = ['Шериф', 'Старший помощник шерифа', 'Помощник шерифа', 'Заместитель', 'Делопроизводитель']

const CATEGORIES: [string, 'in' | 'out', boolean][] = [
  ['Штрафы', 'in', true],
  ['Снаряжение', 'out', true],
  ['Возврат снаряжения', 'in', true],
  ['Выплаты сотрудникам', 'out', true],
  ['Содержание департамента', 'out', false],
  ['Сборы и пожертвования', 'in', false],
  ['Начальный остаток', 'in', true],
  ['Прочее поступление', 'in', false],
  ['Прочий расход', 'out', false],
]

export async function ensureCatalog(): Promise<void> {
  for (const item of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: item.key },
      create: { key: item.key, module: item.module, description: item.description },
      update: { module: item.module, description: item.description },
    })
  }
  for (const preset of ROLE_PRESETS) {
    const role = await prisma.role.upsert({
      where: { key: preset.key },
      create: { key: preset.key, name: preset.name, description: preset.description, system: true },
      update: { name: preset.name, description: preset.description, system: true },
    })
    const assigned = await prisma.rolePermission.count({ where: { roleId: role.id } })
    if (assigned === 0) {
      const permissions = await prisma.permission.findMany({ where: { key: { in: preset.permissions } } })
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      })
    }
  }
  if ((await prisma.rank.count()) === 0) {
    await prisma.rank.createMany({ data: RANKS.map((name, sortOrder) => ({ name, sortOrder })) })
  }
  for (const [name, direction, system] of CATEGORIES) {
    await prisma.financeCategory.upsert({
      where: { name_direction: { name, direction } },
      create: { name, direction, system },
      update: { system },
    })
  }
  const defaults: [string, Prisma.InputJsonValue][] = [
    [SETTING_KEYS.departmentName, DEFAULT_SETTINGS.departmentName],
    [SETTING_KEYS.countyName, DEFAULT_SETTINGS.countyName],
    [SETTING_KEYS.motto, DEFAULT_SETTINGS.motto],
    [SETTING_KEYS.currencySymbol, DEFAULT_SETTINGS.currencySymbol],
    [SETTING_KEYS.currencyCode, DEFAULT_SETTINGS.currencyCode],
    [SETTING_KEYS.recognizeFineOnPayment, DEFAULT_SETTINGS.recognizeFineOnPayment],
    [SETTING_KEYS.recognizeEquipmentCost, DEFAULT_SETTINGS.recognizeEquipmentCost],
    [SETTING_KEYS.discordGuildId, ''],
    [SETTING_KEYS.extraRecipients, []],
    [SETTING_KEYS.notifyEvents, DEFAULT_NOTIFY_EVENTS],
    [SETTING_KEYS.demoSeeded, false],
  ]
  for (const [key, value] of defaults) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
  await grantCitizenAccess()
}

async function grantCitizenAccess(): Promise<void> {
  const done = await prisma.appSetting.findUnique({ where: { key: 'citizens.accessGranted' } })
  if (done) return
  const rows = await prisma.permission.findMany({ where: { key: { in: ['citizens.view', 'citizens.manage'] } } })
  const viewId = rows.find((row) => row.key === 'citizens.view')?.id
  const manageId = rows.find((row) => row.key === 'citizens.manage')?.id
  if (!viewId || !manageId) return
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } })
  for (const role of roles) {
    const keys = new Set(role.permissions.map((item) => item.permission.key))
    const add: { roleId: string; permissionId: string }[] = []
    const canSee = ['wanted.view', 'fines.view', 'seizure.view', 'personnel.view'].some((key) => keys.has(key))
    const canFile = ['wanted.create', 'wanted.manage', 'fines.issue', 'fines.manage', 'seizure.manage', 'personnel.manage'].some((key) => keys.has(key))
    if (canSee && !keys.has('citizens.view')) add.push({ roleId: role.id, permissionId: viewId })
    if (canFile && !keys.has('citizens.manage')) add.push({ roleId: role.id, permissionId: manageId })
    if (add.length) await prisma.rolePermission.createMany({ data: add, skipDuplicates: true })
  }
  await prisma.appSetting.create({ data: { key: 'citizens.accessGranted', value: true } })
}

const CODE_FLAG = 'laws.code.hate1899'

export async function ensureCode(): Promise<void> {
  const done = await prisma.appSetting.findUnique({ where: { key: CODE_FLAG } })
  if (done) return
  for (const [index, article] of SERVER_CODE.entries()) {
    const data = {
      title: article.title,
      category: article.category,
      grade: article.grade,
      description: article.description,
      conditions: article.conditions,
      fineMinCents: article.fineMinCents,
      fineCents: article.fineMaxCents,
      jailMin: article.jailMin,
      jailDays: article.jailMax,
      additionalPenalties: article.additionalPenalties,
      sortOrder: index + 1,
      status: 'active' as const,
      isDemo: false,
    }
    await prisma.law.upsert({
      where: { articleNumber: article.articleNumber },
      create: { articleNumber: article.articleNumber, ...data },
      update: {},
    })
  }
  await prisma.law.updateMany({
    where: { isDemo: true, NOT: { status: 'repealed' } },
    data: { status: 'repealed', sortOrder: 9000 },
  })
  await prisma.appSetting.upsert({
    where: { key: CODE_FLAG },
    create: { key: CODE_FLAG, value: true },
    update: {},
  })
}
