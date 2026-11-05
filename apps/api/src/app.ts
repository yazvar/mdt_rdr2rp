import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { randomUUID } from 'crypto'
import { prisma } from './lib/prisma'
import { errorHandler } from './lib/http'
import { accountingRouter } from './routes/accounting'
import { adminRouter, ranksRouter } from './routes/admin'
import { armoryRouter } from './routes/armory'
import { auditRouter } from './routes/audit'
import { authRouter } from './routes/auth'
import { casesRouter } from './routes/cases'
import { citizensRouter } from './routes/citizens'
import { employeesRouter } from './routes/employees'
import { finesRouter } from './routes/fines'
import { lawsRouter } from './routes/laws'
import { lossesRouter } from './routes/losses'
import { metaRouter } from './routes/meta'
import { releaseRouter } from './routes/release'
import { requestsRouter } from './routes/requests'
import { seizuresRouter } from './routes/seizures'
import { wantedRouter } from './routes/wanted'
import { updatesDir } from './services/release'

const limited = rateLimit({
  windowMs: 60_000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE', message: 'Слишком много запросов. Подождите немного.', details: null } },
})

const authLimited = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE', message: 'Слишком много попыток входа. Подождите десять минут.', details: null } },
})

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(cors({ origin: true, allowedHeaders: ['Authorization', 'Content-Type', 'X-MDT-Version', 'X-MDT-Notes'], exposedHeaders: ['Content-Disposition'] }))
  const updates = express.static(updatesDir(), { index: false, dotfiles: 'deny', fallthrough: false })
  app.use('/updates', (req, res, next) => {
    if (req.path.includes('..') || req.path.endsWith('.part')) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    updates(req, res, next)
  })
  app.use(express.json({ limit: '30mb' }))
  app.use((_req, res, next) => {
    res.setHeader('X-Request-Id', randomUUID())
    next()
  })
  app.get('/health', health)
  app.get('/api/health', health)
  app.use('/api', limited)
  app.use('/api/auth/discord/start', authLimited)
  app.use('/api/auth/dev-login', authLimited)
  app.use('/api/auth', authRouter)
  app.use('/api/employees', employeesRouter)
  app.use('/api/citizens', citizensRouter)
  app.use('/api/armory', armoryRouter)
  app.use('/api/losses', lossesRouter)
  app.use('/api/cases', casesRouter)
  app.use('/api/seizures', seizuresRouter)
  app.use('/api/laws', lawsRouter)
  app.use('/api/wanted', wantedRouter)
  app.use('/api/fines', finesRouter)
  app.use('/api/requests', requestsRouter)
  app.use('/api/accounting', accountingRouter)
  app.use('/api/admin/release', releaseRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/ranks', ranksRouter)
  app.use('/api/audit', auditRouter)
  app.use('/api', metaRouter)
  app.use(errorHandler)
  return app
}

async function health(_req: express.Request, res: express.Response) {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true, db: 'up', time: new Date().toISOString() })
  } catch {
    res.status(503).json({ ok: false, db: 'down', time: new Date().toISOString() })
  }
}
