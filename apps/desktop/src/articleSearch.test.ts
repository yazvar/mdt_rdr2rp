import { describe, expect, it } from 'vitest'
import { articleMatchesQuery, type SearchableArticle } from './articleSearch'

const theft: SearchableArticle = {
  articleNumber: '3.2',
  title: 'Кража',
  description: 'Тайное хищение чужого имущества.',
  fineMinCents: 7500,
  fineCents: 7500,
  jailMin: 1,
  jailDays: 15,
  additionalPenalties: 'Возврат имущества владельцу либо компенсация',
}

const shooting: SearchableArticle = {
  articleNumber: '2.3',
  title: 'Безосновательная стрельба в городе',
  description: 'Безосновательная стрельба в черте города.',
  fineMinCents: 1500,
  fineCents: 75000,
  jailMin: 0,
  jailDays: 15,
  additionalPenalties: '',
}

describe('поиск статьи', () => {
  it('показывает весь список, пока запрос пуст', () => {
    expect(articleMatchesQuery(theft, '   ')).toBe(true)
  })

  it('находит по номеру, названию, описанию и наказанию', () => {
    expect(articleMatchesQuery(theft, '3.2')).toBe(true)
    expect(articleMatchesQuery(theft, 'КРАЖА')).toBe(true)
    expect(articleMatchesQuery(theft, 'хищение')).toBe(true)
    expect(articleMatchesQuery(theft, 'компенсация')).toBe(true)
    expect(articleMatchesQuery(theft, '$75')).toBe(true)
    expect(articleMatchesQuery(theft, '15 сроков')).toBe(true)
    expect(articleMatchesQuery(theft, 'разбой')).toBe(false)
    expect(articleMatchesQuery(shooting, 'стрельба 15')).toBe(true)
    expect(articleMatchesQuery(shooting, 'стрельба кража')).toBe(false)
  })
})
