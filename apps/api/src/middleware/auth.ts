import type { NextFunction, Request, Response } from 'express'
import { PERMISSIONS } from '@mdt/shared'
import type { Actor } from '../lib/actor'
import { HttpError } from '../lib/http'
import { bearerToken, loadActor } from '../lib/session'

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = await loadActor(bearerToken(req.header('authorization')), {
      ip: req.ip ?? '',
      userAgent: req.header('user-agent') ?? '',
    })
    if (!actor) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Сессия недействительна. Войдите через Discord ещё раз.'))
      return
    }
    req.actor = actor
    next()
  } catch (error) {
    next(error)
  }
}

export function requirePermission(...keys: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const decide = (): void => {
      const actor = req.actor
      if (!actor) {
        next(new HttpError(401, 'UNAUTHORIZED', 'Войдите в систему.'))
        return
      }
      if (!keys.some((key) => actor.permissions.has(key))) {
        next(new HttpError(403, 'FORBIDDEN', 'Недостаточно полномочий для этого действия.'))
        return
      }
      next()
    }
    if (req.actor) {
      decide()
      return
    }
    void requireAuth(req, res, (error) => {
      if (error) next(error)
      else decide()
    })
  }
}

export const requireAdmin = requirePermission(PERMISSIONS.adminAccess)

export function actorOf(req: Request): Actor {
  if (!req.actor) throw new HttpError(401, 'UNAUTHORIZED', 'Войдите в систему.')
  return req.actor
}

declare global {
  namespace Express {
    interface Request {
      actor?: import('../lib/actor').Actor
    }
  }
}
