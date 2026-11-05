import { Router } from 'express'
import { PERMISSIONS, pageSchema } from '@mdt/shared'
import type { Prisma } from '@prisma/client'
import { action } from '../lib/http'
import { prisma } from '../lib/prisma'
import { paging, parseQuery } from '../lib/validate'
import { requirePermission } from '../middleware/auth'

export const auditRouter = Router()

auditRouter.get(
  '/',
  requirePermission(PERMISSIONS.auditView),
  action(async (req, res) => {
    const query = parseQuery<{ page: number; pageSize: number; q: string }>(pageSchema, req.query)
    const where: Prisma.AuditLogWhereInput = {}
    if (typeof req.query.module === 'string' && req.query.module) where.module = req.query.module
    if (typeof req.query.action === 'string' && req.query.action) where.action = req.query.action
    if (query.q) {
      where.OR = [
        { actorName: { contains: query.q, mode: 'insensitive' } },
        { discordId: { contains: query.q } },
        { recordId: { contains: query.q } },
        { action: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging(query) }),
    ])
    res.json({ items, page: query.page, pageSize: query.pageSize, total })
  }),
)
