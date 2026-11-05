import './zod-ru'
import { z } from 'zod'

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional().default(''),
  sort: z.string().trim().max(40).optional().default(''),
  dir: z.enum(['asc', 'desc']).optional().default('desc'),
})

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value ?? '')

const discordIdSchema = z
  .string()
  .trim()
  .regex(/^\d{5,22}$/, 'Discord ID должен состоять из цифр')
  .optional()
  .nullable()
  .or(z.literal(''))
  .transform((value) => (value ? value : null))

export const employeeStatusSchema = z.enum(['active', 'suspended', 'dismissed', 'on_leave'])

export const employeeCreateSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Укажите имя').max(80),
    lastName: z.string().trim().min(1, 'Укажите фамилию').max(80),
    badgeNumber: z.string().trim().min(1, 'Укажите табельный номер').max(20),
    rankId: z.string().trim().min(1, 'Выберите звание'),
    position: optionalText(80),
    discordId: discordIdSchema,
    status: employeeStatusSchema.optional().default('active'),
    joinedAt: z.string().datetime({ message: 'Укажите дату вступления' }),
    contact: optionalText(500),
    notes: optionalText(5000),
    serviceComments: optionalText(5000),
    roleKeys: z.array(z.string().trim().min(1).max(40)).max(8).optional().default([]),
    grantAccess: z.boolean().optional().default(false),
  })
  .strict()

export const employeeUpdateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    badgeNumber: z.string().trim().min(1).max(20).optional(),
    rankId: z.string().trim().min(1).optional(),
    position: z.string().trim().max(80).nullable().optional(),
    discordId: z.union([z.string().trim().regex(/^\d{5,22}$/, 'Discord ID должен состоять из цифр'), z.literal(''), z.null()]).optional(),
    status: employeeStatusSchema.optional(),
    joinedAt: z.string().datetime().optional(),
    contact: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(5000).optional(),
    serviceComments: z.string().trim().max(5000).optional(),
    version: z.number().int().positive(),
    reason: z.string().trim().max(500).optional().default(''),
    roleKeys: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    grantAccess: z.boolean().optional(),
  })
  .strict()

export const reasonSchema = z
  .object({
    reason: z.string().trim().min(3, 'Укажите причину, не короче 3 символов').max(500),
    version: z.number().int().positive().optional(),
  })
  .strict()

const photoLink = z
  .string()
  .trim()
  .max(500)
  .optional()
  .default('')
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), 'Ссылка на фотографию должна начинаться с http:// или https://')

const gameFineNumber = z
  .string()
  .trim()
  .max(40, 'Номер штрафа слишком длинный')
  .optional()
  .default('')
  .refine((value) => value === '' || /^[0-9A-Za-zА-Яа-яЁё#\-_./]+$/.test(value), 'В номере штрафа допустимы буквы, цифры и знаки # - _ . /')

export const citizenCreateSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Укажите имя').max(80),
    lastName: z.string().trim().min(1, 'Укажите фамилию').max(80),
    alias: optionalText(80),
    occupation: optionalText(80),
    residence: optionalText(160),
    marks: optionalText(2000),
    notes: optionalText(5000),
    photoData: z.string().max(550_000).optional().default(''),
    photoUrl: photoLink,
  })
  .strict()

export const citizenUpdateSchema = citizenCreateSchema.extend({
  version: z.number().int().positive(),
}).strict()

const citizenLink = z.string().trim().min(1).max(40).optional().nullable()

export const inventoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    serialNumber: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
    quantity: z.number().int().min(0).max(1_000_000),
    unitCostCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
    notes: optionalText(5000),
  })
  .strict()

export const inventoryUpdateSchema = inventoryCreateSchema.partial().extend({
  version: z.number().int().positive(),
}).strict()

export const issueCreateSchema = z
  .object({
    itemId: z.string().trim().min(1),
    employeeId: z.string().trim().min(1),
    quantity: z.number().int().positive().max(100_000),
    serialNumber: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
    notes: optionalText(5000),
    idempotencyKey: z.string().trim().min(8).max(80).optional(),
  })
  .strict()

export const issueReturnSchema = z
  .object({
    version: z.number().int().positive(),
    quantity: z.number().int().positive().optional(),
    notes: optionalText(500),
  })
  .strict()

export const issueStatusSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(['lost', 'written_off']),
    notes: z.string().trim().min(3).max(500),
  })
  .strict()

export const lossCreateSchema = z
  .object({
    itemName: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    quantity: z.number().int().positive().max(100_000),
    serialNumber: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
    responsibleEmployeeId: z.string().trim().min(1).optional().nullable(),
    discoveredAt: z.string().datetime(),
    description: optionalText(5000),
    equipmentIssueId: z.string().trim().optional().nullable(),
    inventoryItemId: z.string().trim().optional().nullable(),
  })
  .strict()

export const lossActionSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(['investigating', 'found', 'returned', 'stored', 'written_off', 'closed']),
    notes: z.string().trim().min(3).max(500),
    returnToStock: z.boolean().optional().default(false),
  })
  .strict()

export const lossLinkSchema = z
  .object({
    version: z.number().int().positive(),
    inventoryItemId: z.string().trim().min(1, 'Выберите карточку склада'),
  })
  .strict()

export const seizureItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    quantity: z.number().int().positive().max(100_000),
    notes: optionalText(300),
  })
  .strict()

export const seizureCreateSchema = z
  .object({
    suspectFirstName: z.string().trim().min(1).max(80),
    suspectLastName: z.string().trim().min(1).max(80),
    seizedAt: z.string().datetime(),
    grounds: z.string().trim().min(3).max(5000),
    location: optionalText(200),
    relatedCaseRef: optionalText(40),
    notes: optionalText(5000),
    items: z.array(seizureItemSchema).min(1, 'Добавьте хотя бы один предмет').max(50),
    citizenId: citizenLink,
    caseId: citizenLink,
  })
  .strict()

export const seizureUpdateSchema = seizureCreateSchema.partial().extend({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  propertyStatus: z.enum(['held', 'returned', 'stored', 'written_off']).optional(),
  items: z.array(seizureItemSchema).min(1).max(50).optional(),
}).strict()

export const lawStatusSchema = z.enum(['active', 'amended', 'repealed'])

export const lawUpsertSchema = z
  .object({
    articleNumber: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(80),
    grade: z.enum(['', 'i', 'm', 'f']).optional().default(''),
    description: optionalText(20000),
    conditions: optionalText(5000),
    fineMinCents: z.number().int().min(0).max(100_000_000).optional().default(0),
    fineCents: z.number().int().min(0).max(100_000_000).optional().default(0),
    jailMin: z.number().int().min(0).max(36500).optional().default(0),
    jailDays: z.number().int().min(0).max(36500).optional().default(0),
    additionalPenalties: optionalText(5000),
    status: lawStatusSchema.optional().default('active'),
    version: z.number().int().positive().optional(),
    reason: z.string().trim().max(500).optional().default(''),
  })
  .strict()

export const lawImportSchema = z
  .object({
    mode: z.enum(['create', 'upsert']).default('create'),
    laws: z.array(lawUpsertSchema.omit({ version: true, reason: true })).min(1).max(500),
  })
  .strict()

export const lawCsvImportSchema = z
  .object({
    mode: z.enum(['create', 'upsert']).default('create'),
    csv: z.string().min(1).max(2_000_000),
  })
  .strict()

export const chargeChoiceSchema = z
  .object({
    lawId: z.string().trim().min(1),
    fineCents: z.number().int().min(0),
    jailDays: z.number().int().min(0).max(36500),
  })
  .strict()

export const wantedCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    photoUrl: z.string().trim().url().max(500).optional().or(z.literal('')).transform((value) => value || ''),
    photoData: z.string().max(550_000).optional().default(''),
    postedAt: z.string().datetime().optional(),
    grounds: z.string().trim().min(3).max(5000),
    description: optionalText(8000),
    wantedLevel: z.number().int().min(1).max(5),
    lawIds: z.array(z.string().trim().min(1)).max(30).optional().default([]),
    charges: z.array(chargeChoiceSchema).max(30).optional().default([]),
    fineCents: z.number().int().min(0).optional(),
    jailDays: z.number().int().min(0).optional(),
    evidence: optionalText(5000),
    citizenId: citizenLink,
  })
  .strict()

export const wantedUpdateSchema = wantedCreateSchema.partial().extend({
  version: z.number().int().positive(),
  reason: z.string().trim().max(500).optional().default(''),
  status: z.enum(['active', 'detained', 'closed', 'cancelled']).optional(),
  closeReason: z.string().trim().max(500).optional(),
}).strict()

export const fineCreateSchema = z
  .object({
    offenderFirstName: z.string().trim().min(1).max(80),
    offenderLastName: z.string().trim().min(1).max(80),
    issuedAt: z.string().datetime().optional(),
    description: optionalText(8000),
    lawIds: z.array(z.string().trim().min(1)).max(30).optional().default([]),
    charges: z.array(chargeChoiceSchema).max(30).optional().default([]),
    adjustmentCents: z.number().int().min(0).optional().nullable(),
    adjustmentReason: z.string().trim().max(500).optional().default(''),
    fineNumber: gameFineNumber,
    wantedId: z.string().trim().optional().nullable(),
    citizenId: citizenLink,
    idempotencyKey: z.string().trim().min(8).max(80).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.charges.length && !value.lawIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Выберите хотя бы одну статью', path: ['charges'] })
    }
  })

export const finePaymentSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(['mark_paid', 'record_payment', 'cancel', 'reopen', 'sentence_served', 'sentence_cancelled']),
    amountCents: z.number().int().positive().optional(),
    reason: z.string().trim().max(500).optional().default(''),
  })
  .strict()

export const requestCreateSchema = z
  .object({
    itemName: z.string().trim().min(1, 'Укажите оружие').max(120),
    serialNumber: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
    inventoryItemId: z.string().trim().optional().nullable(),
    quantity: z.number().int().positive().max(100_000),
    reason: optionalText(2000),
    comment: optionalText(2000),
    employeeId: z.string().trim().optional(),
  })
  .strict()

export const requestReviewSchema = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(['approved', 'rejected', 'closed']),
    comment: z.string().trim().max(1000).optional().default(''),
    inventoryItemId: z.string().trim().optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'rejected' && value.comment.trim().length < 3) {
      ctx.addIssue({ code: 'custom', message: 'Укажите причину отклонения', path: ['comment'] })
    }
  })

export const requestIssueSchema = z
  .object({
    version: z.number().int().positive(),
    inventoryItemId: z.string().trim().min(1),
    serialNumber: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
    notes: optionalText(500),
    idempotencyKey: z.string().trim().min(8).max(80).optional(),
  })
  .strict()

export const caseCreateSchema = z
  .object({
    title: z.string().trim().min(1, 'Укажите название дела').max(160),
    narrative: z.string().trim().min(3, 'Опишите обстоятельства дела').max(20000),
    location: optionalText(200),
    openedAt: z.string().datetime().optional(),
    citizenId: citizenLink,
  })
  .strict()

export const caseUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(160).optional(),
    narrative: z.string().trim().min(3).max(20000).optional(),
    location: z.string().trim().max(200).optional(),
    status: z.enum(['open', 'closed']).optional(),
    closeReason: z.string().trim().max(500).optional().default(''),
    reason: z.string().trim().max(500).optional().default(''),
  })
  .strict()

export const caseLinkSchema = z
  .object({
    seizureId: z.string().trim().min(1),
    unlink: z.boolean().optional().default(false),
  })
  .strict()

export const financeEntrySchema = z
  .object({
    direction: z.enum(['in', 'out']),
    amountCents: z.number().int().positive().max(100_000_000_00),
    occurredAt: z.string().datetime().optional(),
    categoryId: z.string().trim().min(1),
    description: z.string().trim().min(3).max(2000),
    employeeId: z.string().trim().optional().nullable(),
    documentRef: optionalText(120),
    idempotencyKey: z.string().trim().min(8).max(80).optional(),
  })
  .strict()

export const financeCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    direction: z.enum(['in', 'out']),
  })
  .strict()

export const reportQuerySchema = z.object({
  preset: z.enum(['day', 'week', 'month', 'custom']).optional().default('month'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  categoryId: z.string().trim().optional().default(''),
  direction: z.enum(['in', 'out', '']).optional().default(''),
})

export const roleWriteSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9_]+$/, 'Ключ роли: латиница, цифры и подчёркивание'),
    name: z.string().trim().min(1).max(80),
    description: optionalText(300),
    permissions: z.array(z.string().trim().min(1)).max(64),
  })
  .strict()

export const userGrantSchema = z
  .object({
    discordId: z.string().trim().regex(/^\d{5,22}$/, 'Discord ID должен состоять из цифр'),
    employeeId: z.string().trim().optional().nullable(),
    roleKeys: z.array(z.string()).min(1),
    username: z.string().trim().max(80).optional(),
  })
  .strict()

export const userRolesSchema = z
  .object({
    roleKeys: z.array(z.string()).max(12),
    accessGranted: z.boolean().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

export const settingsPatchSchema = z
  .object({
    departmentName: z.string().trim().min(1).max(120).optional(),
    countyName: z.string().trim().min(1).max(120).optional(),
    motto: z.string().trim().max(200).optional(),
    currencySymbol: z.string().trim().min(1).max(4).optional(),
    currencyCode: z.string().trim().min(1).max(8).optional(),
    recognizeFineOnPayment: z.boolean().optional(),
    recognizeEquipmentCost: z.boolean().optional(),
    discordGuildId: z.string().trim().max(22).optional(),
    extraRecipientDiscordIds: z.array(z.string().trim().regex(/^\d{5,22}$/)).max(50).optional(),
    notifyEvents: z.record(z.boolean()).optional(),
  })
  .strict()

export const rankSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    sortOrder: z.number().int().min(0).max(1000).optional().default(0),
  })
  .strict()

export const backupRestoreSchema = z
  .object({
    confirmation: z.literal('ВОССТАНОВИТЬ АРХИВ'),
    backup: z.record(z.unknown()),
  })
  .strict()

export const devLoginSchema = z
  .object({
    discordId: z.string().trim().min(1).max(64),
  })
  .strict()

export const employeeListSchema = pageSchema.extend({
  status: z.enum(['active', 'suspended', 'dismissed', 'on_leave', '']).optional().default(''),
  rankId: z.string().optional().default(''),
  archived: z.enum(['0', '1', 'all']).optional().default('0'),
})

export const recordListSchema = pageSchema.extend({
  status: z.string().trim().max(40).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  employeeId: z.string().trim().optional().default(''),
  mine: z.enum(['0', '1']).optional().default('0'),
})

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(120),
})

export const syncSchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
})
