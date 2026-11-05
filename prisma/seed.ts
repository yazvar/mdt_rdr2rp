import { SETTING_KEYS } from '@mdt/shared'
import { ensureCatalog } from '../apps/api/src/bootstrap'
import { prisma } from '../apps/api/src/lib/prisma'

const NOTE = '[ТЕСТ] Демонстрационная запись. Не относится к действующему серверу.'

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO !== 'true') {
    throw new Error('Тестовые записи не загружаются. Для локальной проверки задайте SEED_DEMO=true. На рабочем сервере этот посев запрещён.')
  }
  await ensureCatalog()
  const rank = async (name: string) => {
    const row = await prisma.rank.findUnique({ where: { name } })
    if (!row) throw new Error(`Нет звания «${name}».`)
    return row
  }
  const ranks = {
    sheriff: await rank('Шериф'),
    under: await rank('Старший помощник шерифа'),
    deputySheriff: await rank('Помощник шерифа'),
    deputy: await rank('Заместитель'),
    clerk: await rank('Делопроизводитель'),
  }
  const role = async (key: string) => prisma.role.findUniqueOrThrow({ where: { key } })
  const roles = {
    administrator: await role('administrator'),
    sheriff: await role('sheriff'),
    undersheriff: await role('undersheriff'),
    deputySheriff: await role('deputy_sheriff'),
    deputy: await role('deputy'),
    viewer: await role('viewer'),
  }

  const people = [
    ['emp_sheriff', 'Илайас', 'Кроу', 'T-001', ranks.sheriff.id, 'Шериф', 'active', 'TEST-DISCORD-SHERIFF', roles.sheriff.id, 'user_sheriff'],
    ['emp_under', 'Марта', 'Квинн', 'T-002', ranks.under.id, 'Старший помощник', 'active', 'TEST-DISCORD-UNDER', roles.undersheriff.id, 'user_under'],
    ['emp_ds', 'Джона', 'Хейл', 'T-014', ranks.deputySheriff.id, 'Помощник шерифа', 'active', 'TEST-DISCORD-DSHERIFF', roles.deputySheriff.id, 'user_ds'],
    ['emp_deputy', 'Клара', 'Восс', 'T-027', ranks.deputy.id, 'Заместитель', 'active', 'TEST-DISCORD-DEPUTY', roles.deputy.id, 'user_deputy'],
    ['emp_leave', 'Нед', 'Брэмбл', 'T-031', ranks.deputy.id, 'Заместитель', 'on_leave', 'TEST-DISCORD-LEAVE', roles.deputy.id, 'user_leave'],
    ['emp_viewer', 'Ада', 'Пелл', 'T-040', ranks.clerk.id, 'Делопроизводитель', 'active', 'TEST-DISCORD-VIEWER', roles.viewer.id, 'user_viewer'],
  ] as const

  for (const [id, firstName, lastName, badgeNumber, rankId, position, status, discordId, roleId, userId] of people) {
    await prisma.employee.upsert({
      where: { badgeNumber },
      create: {
        id,
        firstName,
        lastName,
        badgeNumber,
        rankId,
        position,
        status,
        joinedAt: new Date('1899-04-12T00:00:00.000Z'),
        contact: 'Контора шерифа',
        notes: NOTE,
        serviceComments: NOTE,
        demo: true,
      },
      update: { firstName, lastName, rankId, position, status, notes: NOTE, demo: true, archivedAt: null },
    })
    const employee = await prisma.employee.findUniqueOrThrow({ where: { badgeNumber } })
    await prisma.user.upsert({
      where: { discordId },
      create: {
        id: userId,
        discordId,
        username: `${firstName} ${lastName}`,
        accessGranted: true,
        employeeId: employee.id,
      },
      update: { username: `${firstName} ${lastName}`, accessGranted: true, blocked: false, employeeId: employee.id },
    })
    const user = await prisma.user.findUniqueOrThrow({ where: { discordId } })
    await prisma.userRole.deleteMany({ where: { userId: user.id } })
    await prisma.userRole.create({ data: { userId: user.id, roleId } })
  }

  await prisma.user.upsert({
    where: { discordId: 'TEST-DISCORD-ADMIN' },
    create: { id: 'user_admin', discordId: 'TEST-DISCORD-ADMIN', username: 'Смотритель архива', accessGranted: true },
    update: { username: 'Смотритель архива', accessGranted: true, blocked: false },
  })
  const admin = await prisma.user.findUniqueOrThrow({ where: { discordId: 'TEST-DISCORD-ADMIN' } })
  await prisma.userRole.deleteMany({ where: { userId: admin.id } })
  await prisma.userRole.create({ data: { userId: admin.id, roleId: roles.administrator.id } })

  const items = [
    ['item_revolver', 'Револьвер Cattleman', 'Оружие', 'TEST-REV-01', 3, 1200],
    ['item_carbine', 'Карабин', 'Оружие', 'TEST-CAR-01', 2, 2400],
    ['item_ammo', 'Патроны для карабина', 'Боеприпасы', null, 200, 5],
    ['item_uniform', 'Форма заместителя', 'Обмундирование', null, 10, 400],
    ['item_badge', 'Жетон', 'Обмундирование', null, 12, 50],
    ['item_lasso', 'Лассо', 'Снаряжение', null, 6, 150],
  ] as const
  for (const [id, name, category, serialNumber, quantity, unitCostCents] of items) {
    const item = await prisma.inventoryItem.upsert({
      where: { id },
      create: { id, name, category, serialNumber, quantityOnHand: quantity, unitCostCents, notes: NOTE, demo: true },
      update: { name, category, serialNumber, notes: NOTE, demo: true, archived: false },
    })
    const movements = await prisma.stockMovement.count({ where: { itemId: item.id } })
    if (movements === 0) {
      await prisma.stockMovement.create({
        data: { itemId: item.id, delta: quantity, quantityAfter: quantity, reason: 'ТЕСТ: постановка на учёт', refType: 'seed', refId: item.id, actorName: 'Смотритель архива' },
      })
    }
  }

  const deputy = await prisma.employee.findUniqueOrThrow({ where: { badgeNumber: 'T-027' } })
  const sheriff = await prisma.employee.findUniqueOrThrow({ where: { badgeNumber: 'T-001' } })
  await prisma.equipmentIssue.upsert({
    where: { id: 'issue_demo_revolver' },
    create: {
      id: 'issue_demo_revolver',
      itemId: 'item_revolver',
      itemName: 'Револьвер Cattleman',
      category: 'Оружие',
      quantity: 1,
      serialNumber: 'TEST-REV-01',
      employeeId: deputy.id,
      employeeName: 'Клара Восс',
      employeeBadge: 'T-027',
      issuedById: sheriff.id,
      issuerName: 'Илайас Кроу',
      notes: NOTE,
      demo: true,
      status: 'issued',
    },
    update: { notes: NOTE, demo: true },
  })
  const issueMoves = await prisma.equipmentMovement.count({ where: { issueId: 'issue_demo_revolver' } })
  if (issueMoves === 0) {
    await prisma.equipmentMovement.create({
      data: { issueId: 'issue_demo_revolver', type: 'issue', quantity: 1, toStatus: 'issued', notes: NOTE, actorName: 'Илайас Кроу' },
    })
    const revolverMoves = await prisma.stockMovement.count({ where: { itemId: 'item_revolver', refId: 'issue_demo_revolver' } })
    if (revolverMoves === 0) {
      await prisma.stockMovement.create({
        data: { itemId: 'item_revolver', delta: -1, quantityAfter: 3, reason: 'ТЕСТ: выдача T-027', refType: 'equipment_issue', refId: 'issue_demo_revolver', actorName: 'Илайас Кроу' },
      })
    }
  }

  await prisma.lossRecord.upsert({
    where: { caseNumber: 'T-LS-001' },
    create: {
      id: 'loss_demo_1',
      caseNumber: 'T-LS-001',
      itemName: 'Лассо',
      category: 'Снаряжение',
      quantity: 1,
      responsibleEmployeeId: deputy.id,
      responsibleName: 'Клара Восс',
      responsibleBadge: 'T-027',
      discoveredAt: new Date('1899-06-02T15:00:00.000Z'),
      description: `${NOTE} Потеряно на патруле, тестовая запись.`,
      status: 'open',
      inventoryItemId: 'item_lasso',
      demo: true,
    },
    update: { description: `${NOTE} Потеряно на патруле, тестовая запись.`, demo: true },
  })

  const laws = [
    ['law_demo_1', 'ТЕСТ-1', 'Тестовое нарушение тишины', 'Общественный порядок', 1500, 0],
    ['law_demo_2', 'ТЕСТ-2', 'Тестовое ношение оружия в салуне', 'Оружие', 4000, 2],
    ['law_demo_3', 'ТЕСТ-3', 'Тестовый побег из-под стражи', 'Порядок', 0, 5],
  ] as const
  for (const [id, articleNumber, title, category, fineCents, jailDays] of laws) {
    await prisma.law.upsert({
      where: { articleNumber },
      create: {
        id,
        articleNumber,
        title,
        category,
        description: `${NOTE} Это не закон сервера и не подлежит применению.`,
        conditions: 'Только для проверки MDT.',
        fineCents,
        jailDays,
        additionalPenalties: '',
        status: 'repealed',
        isDemo: true,
      },
      update: { title, isDemo: true, status: 'repealed', description: `${NOTE} Это не закон сервера и не подлежит применению.` },
    })
  }

  await prisma.seizure.upsert({
    where: { caseNumber: 'T-SZ-001' },
    create: {
      id: 'seizure_demo_1',
      caseNumber: 'T-SZ-001',
      suspectFirstName: 'Билл',
      suspectLastName: 'Тестовый',
      seizedAt: new Date('1899-06-11T18:30:00.000Z'),
      grounds: `${NOTE} Изъятие для проверки карточки.`,
      officerId: sheriff.id,
      officerName: 'Илайас Кроу',
      officerBadge: 'T-001',
      location: 'Валентайн, тестовая улица',
      propertyStatus: 'held',
      demo: true,
      items: { create: [{ name: 'Карманный нож', quantity: 1 }, { name: 'Патроны', quantity: 12 }] },
    },
    update: { demo: true, grounds: `${NOTE} Изъятие для проверки карточки.` },
  })

  await prisma.wantedNotice.upsert({
    where: { caseNumber: 'T-WN-001' },
    create: {
      id: 'wanted_demo_1',
      caseNumber: 'T-WN-001',
      firstName: 'Сайлас',
      lastName: 'Тестовый',
      postedAt: new Date('1899-06-20T12:00:00.000Z'),
      grounds: `${NOTE} Учебный розыск.`,
      description: 'Не разыскивать на сервере.',
      wantedLevel: 3,
      fineCents: 4000,
      jailDays: 2,
      createdById: sheriff.id,
      createdByName: 'Илайас Кроу',
      createdByBadge: 'T-001',
      status: 'active',
      demo: true,
      charges: { create: [{ lawId: 'law_demo_2', articleNumber: 'ТЕСТ-2', title: 'Тестовое ношение оружия в салуне' }] },
    },
    update: { demo: true, grounds: `${NOTE} Учебный розыск.` },
  })
  await prisma.wantedNotice.upsert({
    where: { caseNumber: 'T-WN-002' },
    create: {
      id: 'wanted_demo_2',
      caseNumber: 'T-WN-002',
      firstName: 'Энни',
      lastName: 'Пример',
      postedAt: new Date('1899-07-01T09:00:00.000Z'),
      grounds: `${NOTE} Закрытый учебный розыск.`,
      wantedLevel: 1,
      fineCents: 1500,
      createdByName: 'Марта Квинн',
      status: 'detained',
      demo: true,
    },
    update: { demo: true },
  })

  const fineCategory = await prisma.financeCategory.findUniqueOrThrow({ where: { name_direction: { name: 'Штрафы', direction: 'in' } } })
  await prisma.fine.upsert({
    where: { fineNumber: 'T-FN-001' },
    create: {
      id: 'fine_demo_1',
      fineNumber: 'T-FN-001',
      offenderFirstName: 'Сайлас',
      offenderLastName: 'Тестовый',
      issuedById: sheriff.id,
      issuerName: 'Илайас Кроу',
      issuerBadge: 'T-001',
      description: NOTE,
      calculatedCents: 4000,
      amountCents: 4000,
      jailDays: 2,
      paymentStatus: 'unpaid',
      wantedId: 'wanted_demo_1',
      demo: true,
      charges: { create: [{ lawId: 'law_demo_2', articleNumber: 'ТЕСТ-2', title: 'Тестовое ношение оружия в салуне', fineCents: 4000, jailDays: 2 }] },
    },
    update: { demo: true, description: NOTE },
  })
  await prisma.fine.upsert({
    where: { fineNumber: 'T-FN-002' },
    create: {
      id: 'fine_demo_2',
      fineNumber: 'T-FN-002',
      offenderFirstName: 'Том',
      offenderLastName: 'Пример',
      issuerName: 'Джона Хейл',
      issuerBadge: 'T-014',
      description: NOTE,
      calculatedCents: 1500,
      amountCents: 1500,
      paymentStatus: 'paid',
      paidCents: 1500,
      sentenceStatus: 'not_applicable',
      demo: true,
      charges: { create: [{ lawId: 'law_demo_1', articleNumber: 'ТЕСТ-1', title: 'Тестовое нарушение тишины', fineCents: 1500, jailDays: 0 }] },
    },
    update: { demo: true },
  })
  await prisma.financeEntry.upsert({
    where: { sourceKey: 'seed:fine:T-FN-002' },
    create: {
      id: 'finance_demo_fine',
      entryNumber: 'T-FC-001',
      direction: 'in',
      amountCents: 1500,
      currencyCode: 'USD',
      categoryId: fineCategory.id,
      description: `${NOTE} Оплата тестового штрафа T-FN-002.`,
      authorName: 'Джона Хейл',
      documentRef: 'T-FN-002',
      sourceKey: 'seed:fine:T-FN-002',
      sourceType: 'fine',
      sourceId: 'fine_demo_2',
      demo: true,
    },
    update: { demo: true },
  })
  const supply = await prisma.financeCategory.findUniqueOrThrow({ where: { name_direction: { name: 'Снаряжение', direction: 'out' } } })
  await prisma.financeEntry.upsert({
    where: { entryNumber: 'T-FC-002' },
    create: {
      entryNumber: 'T-FC-002',
      direction: 'out',
      amountCents: 800,
      currencyCode: 'USD',
      categoryId: supply.id,
      description: `${NOTE} Тестовая закупка патронов.`,
      authorName: 'Илайас Кроу',
      demo: true,
    },
    update: { demo: true },
  })

  const requests = [
    ['request_demo_1', 'T-EQ-001', deputy.id, 'Клара Восс', 'T-027', 'Патроны для карабина', 'item_ammo', 50, 'pending'],
    ['request_demo_2', 'T-EQ-002', deputy.id, 'Клара Восс', 'T-027', 'Форма заместителя', 'item_uniform', 1, 'approved'],
    ['request_demo_3', 'T-EQ-003', deputy.id, 'Клара Восс', 'T-027', 'Второй револьвер', 'item_revolver', 1, 'rejected'],
  ] as const
  for (const [id, requestNumber, employeeId, requesterName, badgeNumber, itemName, inventoryItemId, quantity, status] of requests) {
    await prisma.equipmentRequest.upsert({
      where: { requestNumber },
      create: {
        id,
        requestNumber,
        employeeId,
        requesterName,
        badgeNumber,
        itemName,
        inventoryItemId,
        quantity,
        reason: `${NOTE} Учебный запрос.`,
        status,
        reviewComment: status === 'rejected' ? 'Тестовый отказ' : '',
        demo: true,
      },
      update: { status, demo: true, reason: `${NOTE} Учебный запрос.` },
    })
  }

  const sheriffUser = await prisma.user.findUniqueOrThrow({ where: { discordId: 'TEST-DISCORD-SHERIFF' } })
  const existingNotice = await prisma.notification.findFirst({ where: { userId: sheriffUser.id, title: 'Тестовое уведомление' } })
  if (!existingNotice) {
    await prisma.notification.create({
      data: { userId: sheriffUser.id, title: 'Тестовое уведомление', body: 'Архив содержит демонстрационные записи с пометкой ТЕСТ.', module: 'admin', recordId: 'seed' },
    })
  }
  await prisma.appSetting.upsert({ where: { key: SETTING_KEYS.demoSeeded }, create: { key: SETTING_KEYS.demoSeeded, value: true }, update: { value: true } })
  console.log('Демонстрационные записи с пометкой ТЕСТ загружены. Вход: ALLOW_DEV_LOGIN=true и Discord ID вида TEST-DISCORD-SHERIFF.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
