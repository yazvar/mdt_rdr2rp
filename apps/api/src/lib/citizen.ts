import type { Prisma } from '@prisma/client'
import { HttpError } from './http'

export async function linkedCitizen(
  tx: Prisma.TransactionClient,
  citizenId: string | null | undefined,
  names: { firstName: string; lastName: string },
) {
  if (!citizenId) {
    return { citizenId: null as string | null, firstName: names.firstName, lastName: names.lastName, photoData: '' }
  }
  const citizen = await tx.citizen.findFirst({ where: { id: citizenId, archivedAt: null } })
  if (!citizen) throw new HttpError(400, 'CITIZEN', 'Гражданин не найден в картотеке. Впишите имя вручную.')
  return { citizenId: citizen.id, firstName: citizen.firstName, lastName: citizen.lastName, photoData: citizen.photoData }
}
