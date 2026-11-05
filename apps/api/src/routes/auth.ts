import { Router } from 'express'
import {
  assertDevLoginAllowed,
  isDevPersonaId,
  pkceChallenge,
  randomToken,
  safeEqual,
  devLoginSchema,
} from '@mdt/shared'
import { config, discordConfigured, redirectUri } from '../config'
import { audit } from '../lib/audit'
import { HttpError, action } from '../lib/http'
import { log } from '../lib/log'
import { prisma, run } from '../lib/prisma'
import { createSession, revokeSession } from '../lib/session'
import { getSettings } from '../lib/settings'
import { parseBody } from '../lib/validate'
import { actorOf, requireAuth } from '../middleware/auth'
import { toPublicUser } from '../lib/actor'

export const authRouter = Router()

function page(title: string, text: string): string {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1a120c;color:#efe2c9;font-family:Georgia,serif"><main style="max-width:460px;padding:32px;border:1px solid #a68456"><p style="letter-spacing:.18em;text-transform:uppercase;color:#d4bc8a">${title}</p><p>${text}</p></main></body></html>`
}

authRouter.get(
  '/config',
  action(async (_req, res) => {
    const settings = await getSettings().catch(() => null)
    res.json({
      departmentName: settings?.departmentName ?? 'Шерифский департамент',
      countyName: settings?.countyName ?? 'Округ',
      motto: settings?.motto ?? '',
      discordConfigured: discordConfigured(),
      devLogin: config.env !== 'production' && config.allowDevLogin,
    })
  }),
)

authRouter.get(
  '/dev-personas',
  action(async (_req, res) => {
    if (config.env === 'production' || !config.allowDevLogin) throw new HttpError(404, 'NOT_FOUND', 'Не найдено.')
    const users = await prisma.user.findMany({
      where: { discordId: { startsWith: 'TEST-DISCORD-' }, accessGranted: true, blocked: false },
      include: { employee: true, roles: { include: { role: true } } },
      orderBy: { discordId: 'asc' },
    })
    res.json({
      items: users.map((user) => ({
        discordId: user.discordId,
        name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.username,
        roles: user.roles.map((link) => link.role.name),
      })),
    })
  }),
)

authRouter.post(
  '/dev-login',
  action(async (req, res) => {
    try {
      assertDevLoginAllowed({ NODE_ENV: config.env, ALLOW_DEV_LOGIN: config.allowDevLogin ? 'true' : 'false' })
    } catch (error) {
      throw new HttpError(403, 'FORBIDDEN', error instanceof Error ? error.message : 'Тестовый вход выключен.')
    }
    const body = parseBody<{ discordId: string }>(devLoginSchema, req.body)
    if (!isDevPersonaId(body.discordId)) throw new HttpError(403, 'FORBIDDEN', 'Такой тестовой учётной записи нет.')
    const user = await prisma.user.findUnique({ where: { discordId: body.discordId }, include: { roles: true, employee: true } })
    if (!user || !user.accessGranted || user.blocked || user.roles.length === 0) {
      throw new HttpError(403, 'FORBIDDEN', 'Тестовый сотрудник не допущен в архив.')
    }
    const token = await run(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      await audit(tx, null, {
        action: 'auth.login',
        module: 'auth',
        recordId: user.id,
        actorId: user.id,
        discordId: user.discordId,
        actorName: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.username,
        newValues: { method: 'dev' },
        ip: req.ip,
      })
      return createSession(tx, user.id, req.header('user-agent') ?? 'dev')
    })
    res.json({ token })
  }),
)

authRouter.post(
  '/discord/start',
  action(async (_req, res) => {
    if (!discordConfigured()) {
      throw new HttpError(503, 'DISCORD', 'Вход через Discord ещё не настроен на сервере.')
    }
    await prisma.oauthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    const id = randomToken(32)
    const state = randomToken(24)
    const codeVerifier = randomToken(48)
    await prisma.oauthAttempt.create({
      data: { id, state, codeVerifier, expiresAt: new Date(Date.now() + 10 * 60_000) },
    })
    const url = new URL('https://discord.com/api/oauth2/authorize')
    url.searchParams.set('client_id', config.discordClientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', redirectUri())
    url.searchParams.set('scope', config.discordScopes)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', pkceChallenge(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('prompt', 'consent')
    res.json({ attemptId: id, authorizationUrl: url.toString() })
  }),
)

authRouter.get(
  '/discord/callback',
  action(async (req, res) => {
    const code = String(req.query.code ?? '')
    const state = String(req.query.state ?? '')
    const attempt = await prisma.oauthAttempt.findUnique({ where: { state } })
    if (!attempt || attempt.expiresAt < new Date() || attempt.status !== 'pending' || !safeEqual(attempt.state, state)) {
      res.status(400).type('html').send(page('Вход отклонен', 'Ссылка устарела или уже использована. Вернитесь в MDT и начните вход заново.'))
      return
    }
    try {
      const profile = await discordProfile(code, attempt.codeVerifier)
      await run(async (tx) => {
        const user = await tx.user.upsert({
          where: { discordId: profile.id },
          create: {
            discordId: profile.id,
            username: profile.username,
            globalName: profile.global_name ?? null,
            avatar: profile.avatar ?? null,
            accessGranted: false,
          },
          update: {
            username: profile.username,
            globalName: profile.global_name ?? null,
            avatar: profile.avatar ?? null,
          },
        })
        if (config.bootstrapDiscordIds.includes(profile.id)) {
          const role = await tx.role.findUnique({ where: { key: 'administrator' } })
          if (role) {
            await tx.user.update({ where: { id: user.id }, data: { accessGranted: true, blocked: false } })
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: role.id } },
              create: { userId: user.id, roleId: role.id },
              update: {},
            })
          }
        }
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          include: { roles: true, employee: true },
        })
        const allowed = Boolean(fresh && fresh.accessGranted && !fresh.blocked && fresh.roles.length > 0)
        if (!fresh || !allowed) {
          await audit(tx, null, {
            action: 'auth.denied',
            module: 'auth',
            recordId: user.id,
            actorId: user.id,
            discordId: profile.id,
            actorName: profile.global_name || profile.username,
            result: 'failure',
            reason: fresh?.blocked ? 'Учётная запись заблокирована' : 'Доступ не выдан',
            ip: req.ip,
          })
          await tx.oauthAttempt.update({
            where: { id: attempt.id },
            data: {
              status: 'denied',
              errorCode: fresh?.blocked ? 'BLOCKED' : 'DENIED',
              errorMessage: fresh?.blocked
                ? 'Учётная запись заблокирована.'
                : 'Доступ в архив департамента не выдан. Обратитесь к шерифу или администратору.',
            },
          })
          return
        }
        await tx.user.update({ where: { id: fresh.id }, data: { lastLoginAt: new Date() } })
        const token = await createSession(tx, fresh.id, req.header('user-agent') ?? '')
        await audit(tx, null, {
          action: 'auth.login',
          module: 'auth',
          recordId: fresh.id,
          actorId: fresh.id,
          discordId: profile.id,
          actorName: fresh.employee ? `${fresh.employee.firstName} ${fresh.employee.lastName}` : profile.global_name || profile.username,
          ip: req.ip,
        })
        await tx.oauthAttempt.update({ where: { id: attempt.id }, data: { status: 'ready', sessionToken: token } })
      })
      const latest = await prisma.oauthAttempt.findUnique({ where: { id: attempt.id } })
      if (latest?.status === 'denied') {
        res.status(403).type('html').send(page('Доступ закрыт', latest.errorMessage || 'Вход не разрешён.'))
        return
      }
      res.type('html').send(page('Вход выполнен', 'Можно закрыть это окно и вернуться в MDT. Окно департамента завершит вход само.'))
    } catch (error) {
      log.error('discord callback failed', { message: error instanceof Error ? error.message : 'unknown' })
      await prisma.oauthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'denied', errorCode: 'OAUTH', errorMessage: 'Discord не подтвердил вход. Повторите попытку.' },
      }).catch(() => undefined)
      res.status(502).type('html').send(page('Вход не выполнен', 'Discord не подтвердил вход. Вернитесь в MDT и повторите попытку.'))
    }
  }),
)

authRouter.get(
  '/discord/poll/:id',
  action(async (req, res) => {
    const attempt = await prisma.oauthAttempt.findUnique({ where: { id: req.params.id } })
    if (!attempt || attempt.expiresAt < new Date()) {
      res.json({ status: 'expired' })
      return
    }
    if (attempt.status === 'pending') {
      res.json({ status: 'pending' })
      return
    }
    if (attempt.status === 'denied') {
      res.json({ status: 'denied', message: attempt.errorMessage || 'Вход не разрешён.' })
      return
    }
    if (attempt.status !== 'ready' || !attempt.sessionToken) {
      res.json({ status: 'consumed' })
      return
    }
    const token = attempt.sessionToken
    const claimed = await prisma.oauthAttempt.updateMany({
      where: { id: attempt.id, status: 'ready' },
      data: { status: 'consumed', sessionToken: null },
    })
    if (claimed.count !== 1) {
      res.json({ status: 'consumed' })
      return
    }
    res.json({ status: 'ready', token })
  }),
)

authRouter.post(
  '/logout',
  requireAuth,
  action(async (req, res) => {
    const actor = actorOf(req)
    await run(async (tx) => {
      await revokeSession(tx, actor.sessionId)
      await audit(tx, actor, { action: 'auth.logout', module: 'auth', recordId: actor.userId })
    })
    res.json({ ok: true })
  }),
)

authRouter.post(
  '/refresh',
  requireAuth,
  action(async (req, res) => {
    const actor = actorOf(req)
    const token = await run(async (tx) => {
      await revokeSession(tx, actor.sessionId)
      return createSession(tx, actor.userId, req.header('user-agent') ?? '', actor.sessionCreatedAt)
    })
    res.json({ token })
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  action(async (req, res) => {
    const actor = actorOf(req)
    const settings = await getSettings()
    res.json({
      user: toPublicUser(actor),
      sessionExpiresAt: actor.sessionExpiresAt.toISOString(),
      department: {
        name: settings.departmentName,
        county: settings.countyName,
        motto: settings.motto,
        currencySymbol: settings.currencySymbol,
        currencyCode: settings.currencyCode,
        demoSeeded: settings.demoSeeded,
      },
    })
  }),
)

async function discordProfile(code: string, verifier: string): Promise<{ id: string; username: string; global_name?: string | null; avatar?: string | null }> {
  const body = new URLSearchParams({
    client_id: config.discordClientId,
    client_secret: config.discordClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!tokenResponse.ok) throw new Error('token exchange rejected')
  const tokenJson = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenJson.access_token) throw new Error('token missing')
  const profileResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  if (!profileResponse.ok) throw new Error('profile rejected')
  const profile = (await profileResponse.json()) as { id?: string; username?: string; global_name?: string | null; avatar?: string | null }
  if (!profile.id || !profile.username) throw new Error('profile incomplete')
  return { id: profile.id, username: profile.username, global_name: profile.global_name, avatar: profile.avatar }
}
