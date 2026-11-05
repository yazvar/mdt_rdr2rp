import type { PublicUser } from '@mdt/shared'
import { displayName, discordAvatarUrl, expandPermissions, fullName } from '@mdt/shared'
import type { Employee, Rank, Role, User } from '@prisma/client'

export interface Actor {
  sessionId: string
  sessionCreatedAt: Date
  sessionExpiresAt: Date
  userId: string
  discordId: string
  username: string
  globalName: string | null
  avatar: string | null
  name: string
  employeeId: string | null
  employee: PublicUser['employee']
  roles: { id: string; key: string; name: string }[]
  permissions: Set<string>
  ip: string
  userAgent: string
}

type UserGraph = User & {
  employee:
    | (Employee & {
        rank: Rank
      })
    | null
  roles: { role: Role & { permissions: { permission: { key: string } }[] } }[]
}

export function actorFromUser(user: UserGraph, session: { id: string; createdAt: Date; expiresAt: Date }, meta: { ip: string; userAgent: string }): Actor {
  const granted = user.roles.flatMap((link) => link.role.permissions.map((item) => item.permission.key))
  const employee = user.employee
    ? {
        id: user.employee.id,
        firstName: user.employee.firstName,
        lastName: user.employee.lastName,
        badgeNumber: user.employee.badgeNumber,
        rank: user.employee.rank.name,
        position: user.employee.position,
        status: user.employee.status,
      }
    : null
  return {
    sessionId: session.id,
    sessionCreatedAt: session.createdAt,
    sessionExpiresAt: session.expiresAt,
    userId: user.id,
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    name: employee ? fullName(employee) : displayName(user),
    employeeId: employee?.id ?? null,
    employee,
    roles: user.roles.map((link) => ({ id: link.role.id, key: link.role.key, name: link.role.name })),
    permissions: expandPermissions(granted),
    ip: meta.ip,
    userAgent: meta.userAgent,
  }
}

export function toPublicUser(actor: Actor): PublicUser {
  return {
    id: actor.userId,
    discordId: actor.discordId,
    username: actor.username,
    globalName: actor.globalName,
    avatarUrl: discordAvatarUrl(actor.discordId, actor.avatar),
    permissions: [...actor.permissions],
    roles: actor.roles,
    employee: actor.employee,
  }
}
