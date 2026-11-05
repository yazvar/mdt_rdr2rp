import { Prisma, PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

export type Tx = Prisma.TransactionClient

export class Effects {
  readonly changes: ChangeNotice[] = []
  readonly users: string[] = []
  readonly disconnects: string[] = []

  change(event: ChangeNotice): void {
    this.changes.push(event)
  }

  notify(userId: string): void {
    if (!this.users.includes(userId)) this.users.push(userId)
  }

  drop(userId: string): void {
    if (!this.disconnects.includes(userId)) this.disconnects.push(userId)
  }
}

export interface ChangeNotice {
  module: string
  action: string
  recordId: string
  permission: string
  employeeId?: string
}

export async function run<T>(work: (tx: Tx, effects: Effects) => Promise<T>): Promise<T> {
  const effects = new Effects()
  const result = await prisma.$transaction((tx) => work(tx, effects), { timeout: 20_000 })
  const { disconnectUser, publish, publishNotification } = await import('./realtime')
  for (const event of effects.changes) publish(event)
  for (const userId of effects.users) publishNotification(userId)
  for (const userId of effects.disconnects) disconnectUser(userId)
  return result
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function uniqueMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null
  const target = String(error.meta?.target ?? '')
  if (target.includes('badgeNumber')) return 'Табельный номер уже используется.'
  if (target.includes('discordId')) return 'Этот Discord ID уже привязан.'
  if (target.includes('articleNumber')) return 'Номер статьи уже существует.'
  if (target.includes('sourceKey')) return 'Эта финансовая операция уже проведена.'
  return 'Такая запись уже существует.'
}
