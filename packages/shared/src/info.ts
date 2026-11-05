export const SETTING_KEYS = {
  departmentName: 'department.name',
  countyName: 'department.county',
  motto: 'department.motto',
  currencySymbol: 'currency.symbol',
  currencyCode: 'currency.code',
  recognizeFineOnPayment: 'ledger.recognizeFineOnPayment',
  recognizeEquipmentCost: 'ledger.recognizeEquipmentCost',
  discordGuildId: 'discord.guildId',
  extraRecipients: 'discord.extraRecipientDiscordIds',
  notifyEvents: 'notify.events',
  demoSeeded: 'demo.seeded',
} as const

export const DEFAULT_NOTIFY_EVENTS: Record<string, boolean> = {
  'equipment_request.created': true,
  'equipment_request.reviewed': true,
  'equipment_request.issued': true,
  'wanted.created': true,
  'access.granted': true,
  'admin.restore': true,
}

export const DEFAULT_SETTINGS = {
  departmentName: 'Шерифский департамент',
  countyName: 'Округ',
  motto: 'Закон и порядок',
  currencySymbol: '$',
  currencyCode: 'USD',
  recognizeFineOnPayment: true,
  recognizeEquipmentCost: false,
}

export interface PublicUser {
  id: string
  discordId: string
  username: string
  globalName: string | null
  avatarUrl: string | null
  permissions: string[]
  roles: { id: string; key: string; name: string }[]
  employee: {
    id: string
    firstName: string
    lastName: string
    badgeNumber: string
    rank: string
    position: string | null
    status: string
  } | null
}

export function discordAvatarUrl(discordId: string, avatar: string | null | undefined): string | null {
  if (!avatar) return null
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`
}

export function displayName(user: { globalName?: string | null; username: string }): string {
  return user.globalName || user.username
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim()
}
