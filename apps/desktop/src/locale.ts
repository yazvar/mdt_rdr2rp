export const LOCALES = ['ru', 'en', 'de'] as const
export type Locale = (typeof LOCALES)[number]

/** Сейчас интерфейс собран на русском. Словари en и de подключаются здесь, без смены модулей. */
export const locale: Locale = 'ru'

export const intlLocale: Record<Locale, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  de: 'de-DE',
}
