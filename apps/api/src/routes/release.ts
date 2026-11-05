import { Router } from 'express'
import { action, HttpError } from '../lib/http'
import { actorOf, requireAdmin } from '../middleware/auth'
import { acceptInstaller, readRelease } from '../services/release'

export const releaseRouter = Router()

releaseRouter.use(requireAdmin)

releaseRouter.get(
  '/',
  action(async (_req, res) => {
    res.json({ release: await readRelease() })
  }),
)

releaseRouter.post('/', (req, res, next) => {
  req.setTimeout(15 * 60 * 1000)
  const version = req.header('x-mdt-version') ?? ''
  let notes = ''
  try {
    notes = decodeURIComponent(req.header('x-mdt-notes') ?? '')
  } catch {
    notes = ''
  }
  acceptInstaller(req, version.trim(), notes.trim(), actorOf(req))
    .then((release) => {
      res.status(201).json({ release })
    })
    .catch((error: unknown) => {
      if (error instanceof HttpError) next(error)
      else next(error)
    })
})
