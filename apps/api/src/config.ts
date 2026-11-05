function unwrap(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function discordCredential(value: string | undefined): string {
  return unwrap(value).replace(/["']/g, '').trim()
}

function oauthScopes(value: string | undefined): string {
  const scopes = unwrap(value)
    .replace(/["']/g, '')
    .split(/[\s,]+/)
    .filter((part) => /^[a-z0-9._:-]+$/i.test(part))
  return scopes.length ? scopes.join(' ') : 'identify'
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL ?? '',
  apiPublicUrl: unwrap(process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  sessionPepper: process.env.SESSION_PEPPER || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-pepper'),
  sessionHours: Number(process.env.SESSION_HOURS) || 24,
  sessionAbsoluteDays: Number(process.env.SESSION_ABSOLUTE_DAYS) || 14,
  discordClientId: discordCredential(process.env.DISCORD_CLIENT_ID),
  discordClientSecret: discordCredential(process.env.DISCORD_CLIENT_SECRET),
  discordScopes: oauthScopes(process.env.DISCORD_OAUTH_SCOPES),
  bootstrapDiscordIds: (process.env.BOOTSTRAP_DISCORD_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d{5,22}$/.test(value)),
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',
  tzOffsetMinutes: Number(process.env.TZ_OFFSET_MINUTES ?? 180),
  mdtPublicUrl: (process.env.MDT_PUBLIC_URL ?? '').replace(/\/$/, ''),
}

export function assertRuntimeConfig(): void {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required')
  if (config.env === 'production' && config.allowDevLogin) {
    throw new Error('ALLOW_DEV_LOGIN cannot be enabled in production')
  }
  if (config.env === 'production' && !process.env.SESSION_PEPPER) {
    throw new Error('SESSION_PEPPER is required in production')
  }
  if (config.env === 'production' && (!config.discordClientId || !config.discordClientSecret || !process.env.API_PUBLIC_URL)) {
    throw new Error('DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and API_PUBLIC_URL are required in production')
  }
}

export function discordConfigured(): boolean {
  return Boolean(config.discordClientId && config.discordClientSecret && config.apiPublicUrl)
}

export const redirectUri = (): string => `${config.apiPublicUrl}/api/auth/discord/callback`
