import {
  DEFAULT_NOTIFY_EVENTS,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
} from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export interface AppSettings {
  departmentName: string
  countyName: string
  motto: string
  currencySymbol: string
  currencyCode: string
  recognizeFineOnPayment: boolean
  recognizeEquipmentCost: boolean
  discordGuildId: string
  extraRecipientDiscordIds: string[]
  notifyEvents: Record<string, boolean>
  demoSeeded: boolean
}

let cache: { at: number; value: AppSettings } | null = null

export function clearSettingsCache(): void {
  cache = null
}

function text(map: Map<string, unknown>, key: string, fallback: string): string {
  const value = map.get(key)
  return typeof value === 'string' && value.trim() ? value : fallback
}

function bool(map: Map<string, unknown>, key: string, fallback: boolean): boolean {
  const value = map.get(key)
  return typeof value === 'boolean' ? value : fallback
}

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value
  const rows = await prisma.appSetting.findMany()
  const map = new Map(rows.map((row) => [row.key, row.value as unknown]))
  const extra = map.get(SETTING_KEYS.extraRecipients)
  const events = map.get(SETTING_KEYS.notifyEvents)
  const value: AppSettings = {
    departmentName: text(map, SETTING_KEYS.departmentName, DEFAULT_SETTINGS.departmentName),
    countyName: text(map, SETTING_KEYS.countyName, DEFAULT_SETTINGS.countyName),
    motto: text(map, SETTING_KEYS.motto, DEFAULT_SETTINGS.motto),
    currencySymbol: text(map, SETTING_KEYS.currencySymbol, DEFAULT_SETTINGS.currencySymbol),
    currencyCode: text(map, SETTING_KEYS.currencyCode, DEFAULT_SETTINGS.currencyCode),
    recognizeFineOnPayment: bool(map, SETTING_KEYS.recognizeFineOnPayment, DEFAULT_SETTINGS.recognizeFineOnPayment),
    recognizeEquipmentCost: bool(map, SETTING_KEYS.recognizeEquipmentCost, DEFAULT_SETTINGS.recognizeEquipmentCost),
    discordGuildId: text(map, SETTING_KEYS.discordGuildId, ''),
    extraRecipientDiscordIds: Array.isArray(extra) ? extra.filter((item): item is string => typeof item === 'string') : [],
    notifyEvents: {
      ...DEFAULT_NOTIFY_EVENTS,
      ...(events && typeof events === 'object' && !Array.isArray(events) ? (events as Record<string, boolean>) : {}),
    },
    demoSeeded: bool(map, SETTING_KEYS.demoSeeded, false),
  }
  cache = { at: Date.now(), value }
  return value
}

export async function putSetting(key: string, value: Prisma.InputJsonValue): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
  clearSettingsCache()
}
