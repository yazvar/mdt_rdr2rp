import { formatMoney, type SentenceBounds } from '@mdt/shared'

export interface SearchableArticle extends SentenceBounds {
  title: string
  description?: string
  conditions?: string
  additionalPenalties?: string
}

/** Пустой запрос оставляет весь список. Иначе каждое слово должно встретиться в номере, названии или видимом тексте статьи. */
export function articleMatchesQuery(law: SearchableArticle, query: string, symbol = '$'): boolean {
  const tokens = query.trim().toLocaleLowerCase('ru-RU').split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const hay = [
    law.articleNumber,
    law.title,
    law.description ?? '',
    law.conditions ?? '',
    law.additionalPenalties ?? '',
    rangeMoney(law, symbol),
    rangeTerms(law),
  ].join(' ').toLocaleLowerCase('ru-RU')
  return tokens.every((token) => hay.includes(token))
}

export function rangeMoney(law: SentenceBounds, symbol: string) {
  if (!law.fineMinCents && !law.fineCents) return 'без штрафа'
  if (law.fineMinCents === law.fineCents) return formatMoney(law.fineCents, symbol)
  return `${formatMoney(law.fineMinCents, symbol)}–${formatMoney(law.fineCents, symbol)}`
}

export function rangeTerms(law: SentenceBounds) {
  if (!law.jailMin && !law.jailDays) return 'без срока'
  if (law.jailMin === law.jailDays) return termText(law.jailDays)
  return `${law.jailMin}–${law.jailDays} сроков`
}

export function termText(value: number) {
  const n = Math.abs(Math.trunc(value))
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'срок' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'срока' : 'сроков'
  return `${n} ${word}`
}
