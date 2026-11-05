import { createHash, randomBytes, timingSafeEqual } from 'crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashSessionToken(token: string, pepper: string): string {
  return sha256(`${pepper}:${token}`)
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

const DEV_LOGIN_PREFIX = 'TEST-DISCORD-'

export function assertDevLoginAllowed(env: { NODE_ENV?: string; ALLOW_DEV_LOGIN?: string }): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Тестовый вход запрещён на рабочем сервере.')
  }
  if (env.ALLOW_DEV_LOGIN !== 'true') {
    throw new Error('Тестовый вход выключен.')
  }
}

export function isDevPersonaId(discordId: string): boolean {
  return discordId.startsWith(DEV_LOGIN_PREFIX) && discordId.length <= 64
}

/** Убирает поля, которые нельзя писать в журнал. */
export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T
}

const SECRET_KEY = /token|secret|password|authorization|pepper|verifier|cookie/i

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!value || typeof value !== 'object') return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEY.test(key) ? '[redacted]' : redactValue(item)
  }
  return output
}
