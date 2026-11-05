import { hashSessionToken, randomToken } from '@mdt/shared'
import { config } from '../config'
import { actorFromUser, type Actor } from './actor'
import { prisma, type Tx } from './prisma'

const userInclude = {
  employee: { include: { rank: true } },
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const

type SessionDb = Tx | typeof prisma

export async function createSession(db: SessionDb, userId: string, userAgent: string, createdAt = new Date()): Promise<string> {
  const token = randomToken()
  const absoluteEnd = new Date(createdAt.getTime() + config.sessionAbsoluteDays * 24 * 60 * 60_000)
  const sliding = new Date(Date.now() + config.sessionHours * 60 * 60_000)
  const expiresAt = sliding < absoluteEnd ? sliding : absoluteEnd
  await db.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token, config.sessionPepper),
      userAgent: userAgent.slice(0, 300),
      createdAt,
      expiresAt,
    },
  })
  return token
}

export async function revokeSession(db: SessionDb, sessionId: string): Promise<void> {
  await db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
}

export async function loadActor(token: string, meta: { ip: string; userAgent: string }): Promise<Actor | null> {
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token, config.sessionPepper) },
    include: { user: { include: userInclude } },
  })
  if (!session || session.revokedAt) return null
  const absoluteEnd = session.createdAt.getTime() + config.sessionAbsoluteDays * 24 * 60 * 60_000
  if (session.expiresAt.getTime() <= Date.now() || absoluteEnd <= Date.now()) return null
  if (!session.user.accessGranted || session.user.blocked || session.user.roles.length === 0) return null
  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {
    const sliding = new Date(Date.now() + config.sessionHours * 60 * 60_000)
    const expiresAt = sliding.getTime() < absoluteEnd ? sliding : new Date(absoluteEnd)
    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(), expiresAt } })
    session.expiresAt = expiresAt
  }
  return actorFromUser(session.user, session, meta)
}

export function bearerToken(header: string | undefined): string {
  if (!header) return ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return ''
  return token.trim()
}
