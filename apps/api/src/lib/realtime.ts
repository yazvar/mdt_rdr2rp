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

export function disconnectUser(userId: string): void {
  if (!io) return
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId === userId) socket.disconnect(true)
  }
}
