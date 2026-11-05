import './env'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { assertRuntimeConfig, config } from './config'
import { ensureCatalog, ensureCode } from './bootstrap'
import { createApp } from './app'
import { log } from './lib/log'
import { prisma } from './lib/prisma'
import { attachIo, noteDisconnected, publishPresence } from './lib/realtime'
import { ensureUpdatesDir } from './services/release'
import { loadActor } from './lib/session'

async function main() {
  assertRuntimeConfig()
  await connect()
  await ensureCatalog()
  await ensureCode()
  await ensureUpdatesDir()
  const app = createApp()
  const server = createServer(app)
  const io = new Server(server, { cors: { origin: true } })
  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : ''
      const actor = await loadActor(token, { ip: socket.handshake.address ?? '', userAgent: 'socket' })
      if (!actor) {
        next(new Error('UNAUTHORIZED'))
        return
      }
      socket.data.permissions = [...actor.permissions]
      socket.data.employeeId = actor.employeeId
      socket.data.userId = actor.userId
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined
    if (userId) socket.join(`user:${userId}`)
    publishPresence()
    socket.on('disconnect', () => noteDisconnected())
  })
  attachIo(io)
  server.requestTimeout = 15 * 60 * 1000
  server.headersTimeout = 16 * 60 * 1000
  server.listen(config.port, '0.0.0.0', () => {
    log.info('mdt api listening', { port: config.port })
  })
}

async function connect() {
  let last: unknown
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`
      return
    } catch (error) {
      last = error
      log.error('database not ready', { attempt, message: error instanceof Error ? error.message : 'unknown' })
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
  throw last
}

main().catch((error) => {
  log.error('api failed to start', { message: error instanceof Error ? error.message : 'unknown' })
  process.exit(1)
})
