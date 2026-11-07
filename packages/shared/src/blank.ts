/** Текст штрафного бланка в форме, которую вставляют в игру. Год в дате — 1918, оплата — через 3 дня. */

export const BLANK_DEPARTMENTS = [
  'Полицейский департамент Сен-Дени',
  'Полицейский департамент Блэквотер',
  'Шерифский офис Армадилло',
  'Шерифский офис Валентайн',
  'Шерифский офис Аннесбург',
  'Шерифский офис Ван-Хорн',
  'Шерифский офис Роудс',
  'Шерифский офис Лимпани',
  'Шерифский офис Строуберри',
  'Шерифский офис Тамблвид',
] as const

export function articleChargeLabel(articleNumber: string, grade: string): string {
  if (grade === 'i' || grade === 'm' || grade === 'f') return `${articleNumber} (${grade})`
  return articleNumber
}

export function guessBlankDepartment(departmentName: string, county: string): string {
  const hay = `${departmentName} ${county}`.toLowerCase()
  const found = BLANK_DEPARTMENTS.find((item) => {
    const town = item.split(' ').at(-1)?.toLowerCase() ?? ''
    return town.length > 3 && hay.includes(town)
  })
  if (found) return found
  const name = departmentName.trim()
  return name || BLANK_DEPARTMENTS[0]
}

export function blankDollars(cents: number): string {
  const abs = Math.abs(Math.trunc(cents))
  const major = Math.floor(abs / 100)
  const minor = abs % 100
  if (!minor) return String(major)
  return `${major}.${minor.toString().padStart(2, '0')}`
}

export interface FineBlankInput {
  citizen: string
  passport: string
  articles: string
  fineCents: number
  terms: number
  department: string
  rank: string
  officer: string
  now?: Date
}

export function fineBlankText(input: FineBlankInput): string {
  const citizen = input.citizen.trim() || 'Имя Фамилия'
  const passport = input.passport.trim() || '№паспорта'
  const officer = input.officer.trim() || 'Имя Фамилия'
  const department = input.department.trim() || 'Шерифский департамент'
  const rank = input.rank.trim() || 'сотрудник'
  const articles = input.articles.trim() || 'номера статей'
  const terms = Math.max(0, Math.trunc(input.terms))
  const issue = rpIssueDate(input.now ?? new Date())
  const due = addUtcDays(issue, 3)
  const dueText = formatBlankDate(due)
  return [
    `Гражданин: ${citizen} №${passport}`,
    `Обвиняется в нарушении статей: ${articles}`,
    `Приговорен к тюремному заключению в ${terms} сроков и штрафу $${blankDollars(input.fineCents)}.`,
    `Приговор был приведен к исполнению в ${department}.`,
    `Штраф обязан выплатить до ${dueText} (3 дня) в ${department}.`,
    'В случае не оплаты штрафа подлежит подачи в розыск и аресту.',
    `Штраф выписал ${rank} ${department} ${officer}.`,
    '',
    `${citizen} ${passport} до ${dueText} - НЕ ОПЛАЧЕН`,
  ].join('\n')
}

function rpIssueDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `1918-${month}-${day}`
}

function addUtcDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatBlankDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}
