import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { FineAmountError } from '@mdt/shared'
import { StockError } from '@mdt/shared'
import { Prisma } from '@prisma/client'
import { uniqueMessage } from './prisma'
import { log } from './log'
import { logSystemError } from './errorsLog'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function notFound(message = 'Запись не найдена.'): HttpError {
  return new HttpError(404, 'NOT_FOUND', message)
}

export function conflict(message = 'Запись изменена другим сотрудником. Обновите карточку и повторите действие.'): HttpError {
  return new HttpError(409, 'CONFLICT', message)
}

export function action(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details ?? null } })
    return
  }
  if (error instanceof FineAmountError || error instanceof StockError) {
    const status = error.code === 'NO_ADJUST' ? 403 : 400
    res.status(status).json({ error: { code: error.code, message: error.message, details: null } })
    return
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION', message: 'Проверьте заполнение формы.', details: error.flatten() },
    })
    return
  }
  const unique = uniqueMessage(error)
  if (unique) {
    res.status(409).json({ error: { code: 'UNIQUE', message: unique, details: null } })
    return
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Запись не найдена.', details: null } })
      return
    }
    if (['P1001', 'P1002', 'P1017', 'P2024'].includes(error.code)) {
      res.status(503).json({ error: { code: 'DB', message: 'Архив департамента временно недоступен.', details: null } })
      return
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({ error: { code: 'DB', message: 'Архив департамента временно недоступен.', details: null } })
    return
  }
  const requestId = String(res.getHeader('X-Request-Id') ?? '')
  log.error('request failed', { requestId, path: req.path, message: error instanceof Error ? error.message : 'unknown' })
  void logSystemError('api', error, req.path)
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Операция не выполнена. Сведения переданы в журнал ошибок.', details: null } })
}
