import { describe, expect, it } from 'vitest'
import {
  expandPermissions,
  hasPermission,
  PERMISSIONS,
  presetPermissions,
} from './permissions'
import {
  FineAmountError,
  formatMoney,
  parseMoneyToCents,
  paymentDelta,
  paymentStatusFor,
  resolveFineAmount,
  summarizeCharges,
} from './money'
import { assertRequestTransition, nextQuantity, quantitiesMatchLedger, StockError } from './stock'
import { assertDevLoginAllowed, hashSessionToken, isDevPersonaId, redactSecrets, safeEqual } from './security'
import { employeeCreateSchema, financeEntrySchema } from './schemas'
import { sentenceError, totalsError } from './sentence'
import { zonedStart } from './time'

describe('пределы наказания', () => {
  const law = { articleNumber: '2.1', fineMinCents: 0, fineCents: 2000, jailMin: 0, jailDays: 0 }
  it('принимает штраф внутри статьи и отвергает выход за свод', () => {
    expect(sentenceError(law, { fineCents: 2000, jailDays: 0 })).toBeNull()
    expect(sentenceError(law, { fineCents: 2001, jailDays: 0 })).toMatch(/2\.1/)
    expect(totalsError(75_000, 60)).toBeNull()
    expect(totalsError(75_001, 0)).toMatch(/750/)
    expect(totalsError(0, 61)).toMatch(/60/)
  })
})

describe('права должностей', () => {
  it('даёт заместителю только свои записи склада и выдачу штрафа', () => {
    const perms = presetPermissions('deputy')
    expect(hasPermission(perms, PERMISSIONS.armoryViewOwn)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.armoryViewAll)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.armoryManage)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.finesIssue)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.citizensManage)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.citizensView)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.finesAdjust)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.accountingView)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.requestsCreate)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.requestsReview)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.adminAccess)).toBe(false)
  })

  it('разделяет бухгалтерию помощника шерифа и шерифа', () => {
    expect(hasPermission(presetPermissions('deputy_sheriff'), PERMISSIONS.accountingView)).toBe(true)
    expect(hasPermission(presetPermissions('deputy_sheriff'), PERMISSIONS.accountingManage)).toBe(false)
    expect(hasPermission(presetPermissions('deputy_sheriff'), PERMISSIONS.lawsEdit)).toBe(true)
    expect(hasPermission(presetPermissions('deputy_sheriff'), PERMISSIONS.lawsManage)).toBe(false)
    expect(hasPermission(presetPermissions('sheriff'), PERMISSIONS.accountingManage)).toBe(true)
    expect(hasPermission(presetPermissions('sheriff'), PERMISSIONS.adminAccess)).toBe(false)
    expect(hasPermission(presetPermissions('undersheriff'), PERMISSIONS.wantedManage)).toBe(true)
  })

  it('наблюдатель ничего не меняет', () => {
    const perms = presetPermissions('viewer')
    expect(hasPermission(perms, PERMISSIONS.citizensView)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.citizensManage)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.finesView)).toBe(true)
    expect(hasPermission(perms, PERMISSIONS.finesIssue)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.requestsCreate)).toBe(false)
    expect(hasPermission(perms, PERMISSIONS.personnelManage)).toBe(false)
  })

  it('администратор проходит любую проверку', () => {
    const expanded = expandPermissions([PERMISSIONS.adminAccess])
    expect(expanded.has(PERMISSIONS.accountingManage)).toBe(true)
    expect(expanded.has(PERMISSIONS.usersManage)).toBe(true)
  })
})

describe('штрафы и деньги', () => {
  it('суммирует статьи и запрещает самовольную корректировку', () => {
    const summary = summarizeCharges([
      { fineCents: 500, jailDays: 1, additionalPenalties: 'конфискация' },
      { fineCents: 250, jailDays: 0, additionalPenalties: '' },
    ])
    expect(summary).toEqual({ fineCents: 750, jailDays: 1, additionalPenalties: 'конфискация' })
    expect(() =>
      resolveFineAmount({ calculatedCents: 750, adjustmentCents: 100, adjustmentReason: 'снисхождение', canAdjust: false }),
    ).toThrow(FineAmountError)
    expect(
      resolveFineAmount({ calculatedCents: 750, adjustmentCents: 100, adjustmentReason: 'решение шерифа', canAdjust: true }),
    ).toEqual({ amountCents: 100, adjusted: true, reason: 'решение шерифа' })
  })

  it('требует причину и считает доплату', () => {
    expect(() => resolveFineAmount({ calculatedCents: 100, adjustmentCents: 50, adjustmentReason: '  ', canAdjust: true })).toThrow(
      /причину/,
    )
    expect(paymentDelta(200, 500)).toBe(300)
    expect(paymentStatusFor(0, 500, false)).toBe('unpaid')
    expect(paymentStatusFor(200, 500, false)).toBe('partial')
    expect(paymentStatusFor(500, 500, false)).toBe('paid')
    expect(paymentStatusFor(500, 500, true)).toBe('cancelled')
    expect(formatMoney(123456, '$')).toBe('$1 234.56')
    expect(parseMoneyToCents('15.5')).toBe(1550)
    expect(parseMoneyToCents('15,50')).toBe(1550)
    expect(parseMoneyToCents('$15.50')).toBe(1550)
    expect(parseMoneyToCents('-1')).toBeNull()
  })
})

describe('склад и запросы', () => {
  it('не уводит остаток ниже нуля и сверяет журнал', () => {
    expect(nextQuantity(10, -4)).toBe(6)
    expect(() => nextQuantity(1, -2)).toThrow(StockError)
    expect(quantitiesMatchLedger(6, [10, -4])).toBe(true)
    expect(quantitiesMatchLedger(5, [10, -4])).toBe(false)
  })

  it('разрешает только прямой переход статуса запроса', () => {
    expect(() => assertRequestTransition('pending', 'approved')).not.toThrow()
    expect(() => assertRequestTransition('pending', 'issued')).toThrow(StockError)
    expect(() => assertRequestTransition('approved', 'issued')).not.toThrow()
    expect(() => assertRequestTransition('issued', 'approved')).toThrow(StockError)
  })
})

describe('сессии и тестовый вход', () => {
  it('отличает токены и скрывает секреты', () => {
    const hash = hashSessionToken('abc', 'pepper')
    expect(hash).toHaveLength(64)
    expect(hashSessionToken('abc', 'pepper')).toBe(hash)
    expect(hashSessionToken('abc', 'other')).not.toBe(hash)
    expect(safeEqual(hash, hash)).toBe(true)
    expect(safeEqual('a', 'ab')).toBe(false)
    expect(redactSecrets({ token: 'x', nested: { botToken: 'y', name: 'Илайас' } })).toEqual({
      token: '[redacted]',
      nested: { botToken: '[redacted]', name: 'Илайас' },
    })
  })

  it('запрещает тестовый вход в production и для чужих идентификаторов', () => {
    expect(() => assertDevLoginAllowed({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'true' })).toThrow(/рабочем сервере/)
    expect(() => assertDevLoginAllowed({ NODE_ENV: 'development', ALLOW_DEV_LOGIN: 'false' })).toThrow(/выключен/)
    expect(() => assertDevLoginAllowed({ NODE_ENV: 'development', ALLOW_DEV_LOGIN: 'true' })).not.toThrow()
    expect(isDevPersonaId('TEST-DISCORD-DEPUTY')).toBe(true)
    expect(isDevPersonaId('123456789012345678')).toBe(false)
  })
})

describe('сообщения формы', () => {
  it('объясняет ошибки по-русски', () => {
    const extra = financeEntrySchema.safeParse({
      direction: 'out',
      amount: '12',
      amountCents: 1200,
      categoryId: 'a',
      description: 'закупка',
    })
    expect(extra.success).toBe(false)
    if (!extra.success) expect(extra.error.issues[0]?.message).toMatch(/Форма устарела/)

    const blank = employeeCreateSchema.safeParse({})
    expect(blank.success).toBe(false)
    if (!blank.success) {
      expect(blank.error.issues.find((issue) => issue.path[0] === 'firstName')?.message).toMatch(/имя/)
      expect(blank.error.issues.every((issue) => /[А-Яа-яЁё]/.test(issue.message))).toBe(true)
    }
    const emptyName = employeeCreateSchema.safeParse({ firstName: '', lastName: 'Кроу', badgeNumber: '1', rankId: 'rank', joinedAt: new Date().toISOString() })
    expect(emptyName.success).toBe(false)
    if (!emptyName.success) expect(emptyName.error.issues[0]?.message).toBe('Укажите имя')
  })
})

describe('отчётные периоды', () => {
  it('начинает неделю с понедельника в заданном смещении', () => {
    const wednesday = new Date('2026-10-28T12:00:00.000Z')
    const start = zonedStart(wednesday, 0, 'week')
    expect(start.toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })
})
