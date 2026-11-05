import { formatMoney } from '@mdt/shared'
import { intlLocale, locale } from './locale'

export function when(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function money(cents?: number | null, symbol = '$'): string {
  return formatMoney(cents ?? 0, symbol)
}

export function toLocalInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

const labels: Record<string, string> = {
  active: 'На службе',
  suspended: 'Отстранён',
  dismissed: 'Уволен',
  on_leave: 'В отпуске',
  issued: 'Выдано',
  returned: 'Возвращено',
  lost: 'Утеряно',
  written_off: 'Списано',
  open: 'Открыто',
  investigating: 'Проверяется',
  found: 'Найдено',
  stored: 'На хранении',
  closed: 'Закрыто',
  held: 'Удержано',
  amended: 'Изменена',
  repealed: 'Отменена',
  detained: 'Задержан',
  cancelled: 'Отменён',
  unpaid: 'Не оплачен',
  partial: 'Частично',
  paid: 'Оплачен',
  pending: 'Ожидает',
  served: 'Исполнено',
  not_applicable: 'Не применяется',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  in: 'Доход',
  out: 'Расход',
}

export function statusText(code?: string | null): string {
  if (!code) return '—'
  return labels[code] ?? code
}

export function statusTone(code?: string | null): string {
  if (!code) return ''
  if (['active', 'paid', 'issued', 'approved', 'served', 'found', 'returned'].includes(code)) return 'ok'
  if (['pending', 'partial', 'on_leave', 'suspended', 'held', 'investigating', 'detained', 'amended', 'open', 'stored'].includes(code)) return 'warn'
  if (['dismissed', 'cancelled', 'rejected', 'lost', 'written_off', 'repealed', 'closed'].includes(code)) return 'danger'
  return ''
}

const actions: Record<string, string> = {
  'loss.create': 'Зарегистрирована утеря',
  'loss.update': 'Изменена запись об утере',
  'employee.create': 'Добавлен сотрудник',
  'employee.update': 'Изменена карточка сотрудника',
  'employee.archive': 'Сотрудник отправлен в архив',
  'employee.restore': 'Сотрудник возвращён из архива',
  'inventory.create': 'Добавлена карточка склада',
  'inventory.update': 'Изменена карточка склада',
  'armory.issue': 'Снаряжение выдано',
  'armory.return': 'Снаряжение возвращено',
  'armory.update': 'Изменена выдача',
  'seizure.create': 'Записана конфискация',
  'seizure.update': 'Изменена конфискация',
  'citizen.create': 'Добавлен гражданин',
  'citizen.update': 'Изменена карточка гражданина',
  'citizen.archive': 'Гражданин убран в архив',
  'citizen.restore': 'Гражданин возвращён из архива',
  'law.create': 'Добавлена статья',
  'law.update': 'Изменена статья',
  'law.import': 'Загружены законы',
  'wanted.create': 'Объявлен розыск',
  'wanted.update': 'Изменён розыск',
  'fine.create': 'Оформлен штраф',
  'fine.update': 'Изменён штраф',
  'fine.cancel': 'Штраф отменён',
  'fine.sentence': 'Изменён статус наказания',
  'fine.payment': 'Записана оплата штрафа',
  'request.create': 'Создан запрос снаряжения',
  'request.review': 'Рассмотрен запрос',
  'request.issue': 'Снаряжение выдано по запросу',
  'finance.create': 'Проведена операция',
  'finance.category': 'Добавлена категория казны',
  'settings.update': 'Изменены настройки',
  'access.grant': 'Выдан доступ',
  'access.revoke': 'Доступ отозван',
  'role.update': 'Изменены права роли',
  'backup.export': 'Скачана копия архива',
  'backup.restore': 'Архив восстановлен',
  'demo.archive': 'Тестовые записи архивированы',
  'release.publish': 'Опубликовано обновление приложения',
  'auth.login': 'Вход в архив',
  'auth.logout': 'Выход из архива',
  'auth.denied': 'Вход отклонён',
  'rank.create': 'Добавлено звание',
}

const modules: Record<string, string> = {
  loss: 'Утеря',
  personnel: 'Сотрудники',
  armory: 'Вооружение',
  seizure: 'Конфискат',
  citizens: 'Граждане',
  laws: 'Законы',
  wanted: 'Розыск',
  fines: 'Штрафы',
  requests: 'Запросы',
  accounting: 'Казна',
  access: 'Доступ',
  admin: 'Администрация',
  auth: 'Вход',
}

export function actionText(code?: string | null): string {
  if (!code) return '—'
  return actions[code] ?? 'Действие в архиве'
}

export function moduleText(code?: string | null): string {
  if (!code) return '—'
  return modules[code] ?? 'Архив'
}

export function sourceText(code?: string | null): string {
  if (code === 'api') return 'Сервер'
  if (code === 'bot') return 'Бот Discord'
  return 'Система'
}

export const notifyLabel: Record<string, string> = {
  'equipment_request.created': 'Новый запрос снаряжения',
  'equipment_request.reviewed': 'Решение по запросу снаряжения',
  'equipment_request.issued': 'Выдача по запросу',
  'wanted.created': 'Новый розыск',
  'access.granted': 'Выдан доступ',
  'admin.restore': 'Восстановление архива',
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}
