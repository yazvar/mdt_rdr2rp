import type { Server } from 'socket.io'
import { hasPermission } from '@mdt/shared'
import type { ChangeNotice } from './prisma'

let io: Server | null = null

export function attachIo(server: Server): void {
  io = server
}

export function publish(event: ChangeNotice): void {
  if (!io) return
  for (const socket of io.sockets.sockets.values()) {
    const permissions = (socket.data.permissions as string[] | undefined) ?? []
    const employeeId = (socket.data.employeeId as string | null | undefined) ?? null
    const allowed = hasPermission(permissions, event.permission)
    const owns = Boolean(event.employeeId && employeeId && employeeId === event.employeeId)
    if (allowed || owns) socket.emit('mdt:change', event)
  }
}

export function publishNotification(userId: string): void {
  io?.to(`user:${userId}`).emit('mdt:notification', { userId })
}

export function publishRelease(info: { version: string; notes: string }): void {
  io?.emit('mdt:release', info)
}

export function publishBroadcast(info: { message: string; actorName: string; createdAt: string }): void {
  io?.emit('mdt:broadcast', info)
}

export function onlineUserIds(): string[] {
  if (!io) return []
  const ids = new Set<string>()
  for (const socket of io.sockets.sockets.values()) {
    const userId = socket.data.userId as string | undefined
    if (userId) ids.add(userId)
  }
  return [...ids]
}

export function publishPresence(): void {
  if (!io) return
  const userIds = onlineUserIds()
  for (const socket of io.sockets.sockets.values()) {
    const permissions = (socket.data.permissions as string[] | undefined) ?? []
    if (hasPermission(permissions, 'admin.access')) socket.emit('mdt:presence', { userIds })
  }
}

export function noteDisconnected(): void {
  setTimeout(() => publishPresence(), 0)
}

export function disconnectUser(userId: string): void {
  if (!io) return
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId === userId) socket.disconnect(true)
  }
}
