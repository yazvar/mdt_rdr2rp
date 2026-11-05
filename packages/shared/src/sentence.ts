/** Общие пределы свода: итоговый штраф и срок лишения свободы. */
export const FINE_CAP_CENTS = 75_000
export const JAIL_CAP = 60

export interface SentenceBounds {
  articleNumber: string
  fineMinCents: number
  fineCents: number
  jailMin: number
  jailDays: number
}

export interface SentenceChoice {
  fineCents: number
  jailDays: number
}

export function gradeLabel(grade: string): string {
  if (grade === 'i') return 'Административное правонарушение'
  if (grade === 'm') return 'Проступок'
  if (grade === 'f') return 'Уголовное преступление'
  return 'Общее положение'
}

export function gradeMark(grade: string): string {
  if (grade === 'i' || grade === 'm' || grade === 'f') return `(${grade})`
  return ''
}

/** Пустая строка, если выбранное наказание входит в пределы статьи. */
export function sentenceError(law: SentenceBounds, choice: SentenceChoice): string | null {
  const fine = Math.trunc(choice.fineCents)
  const jail = Math.trunc(choice.jailDays)
  if (fine < law.fineMinCents || fine > law.fineCents) {
    return `Штраф по статье ${law.articleNumber} выходит за пределы свода.`
  }
  if (jail < law.jailMin || jail > law.jailDays) {
    return `Срок по статье ${law.articleNumber} выходит за пределы свода.`
  }
  return null
}

/** Пустая строка, если сумма статей не выше общих пределов свода. */
export function totalsError(fineCents: number, jailDays: number): string | null {
  if (Math.trunc(fineCents) > FINE_CAP_CENTS) return 'Итоговый штраф не может быть больше 750$.'
  if (Math.trunc(jailDays) > JAIL_CAP) return 'Итоговый срок не может быть больше 60 сроков.'
  return null
}
