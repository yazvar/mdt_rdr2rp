import type { Prisma } from '@prisma/client'
import { sentenceError, summarizeCharges, totalsError } from '@mdt/shared'
import { HttpError } from './http'

export interface ChargePick {
  lawId: string
  fineCents: number
  jailDays: number
}

export async function resolveCharges(tx: Prisma.TransactionClient, input: { lawIds: string[]; charges: ChargePick[] }) {
  const useChoices = input.charges.length > 0
  const picks = useChoices ? input.charges : input.lawIds.map((lawId) => ({ lawId, fineCents: -1, jailDays: -1 }))
  if (!picks.length) return null
  const ids = picks.map((pick) => pick.lawId)
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'LAW', 'Одна статья выбрана дважды.')
  const laws = await tx.law.findMany({ where: { id: { in: ids } } })
  if (laws.length !== ids.length) throw new HttpError(400, 'LAW', 'Одна из статей не найдена.')
  if (laws.some((law) => law.status === 'repealed' || law.isDemo)) {
    throw new HttpError(400, 'LAW', 'Нельзя применять отменённую или тестовую статью.')
  }
  const byId = new Map(laws.map((law) => [law.id, law]))
  const chosen = picks.map((pick) => {
    const law = byId.get(pick.lawId)
    if (!law) throw new HttpError(400, 'LAW', 'Одна из статей не найдена.')
    const fineCents = pick.fineCents < 0 ? law.fineCents : pick.fineCents
    const jailDays = pick.jailDays < 0 ? law.jailDays : pick.jailDays
    const error = sentenceError(law, { fineCents, jailDays })
    if (error) throw new HttpError(400, 'SENTENCE', error)
    return { law, fineCents, jailDays }
  })
  const summary = summarizeCharges(chosen.map((row) => ({
    fineCents: row.fineCents,
    jailDays: row.jailDays,
    additionalPenalties: row.law.additionalPenalties,
  })))
  const cap = totalsError(summary.fineCents, summary.jailDays)
  if (cap) throw new HttpError(400, 'SENTENCE', cap)
  return { chosen, summary }
}
