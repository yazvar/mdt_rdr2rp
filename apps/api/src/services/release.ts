import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { Request } from 'express'
import { audit } from '../lib/audit'
import type { Actor } from '../lib/actor'
import { HttpError } from '../lib/http'
import { log } from '../lib/log'
import { prisma } from '../lib/prisma'
import { publishRelease } from '../lib/realtime'

const MAX_BYTES = 400 * 1024 * 1024
const MIN_BYTES = 8 * 1024 * 1024

export interface ReleaseInfo {
  version: string
  notes: string
  filename: string
  size: number
  releasedAt: string
}

export function updatesDir(): string {
  if (process.env.UPDATES_DIR?.trim()) return process.env.UPDATES_DIR.trim()
  if (process.env.NODE_ENV === 'production') return '/data/updates'
  return path.resolve(__dirname, '../../../../data/updates')
}

function nestedHttp(error: unknown): HttpError | null {
  if (!error || typeof error !== 'object' || !('cause' in error)) return null
  const cause = (error as { cause?: unknown }).cause
  return cause instanceof HttpError ? cause : null
}

export function isNewerVersion(next: string, current: string): boolean {
  const left = next.split('.').map((part) => Number(part))
  const right = current.split('.').map((part) => Number(part))
  for (let index = 0; index < 3; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

export async function ensureUpdatesDir(): Promise<void> {
  try {
    await mkdir(updatesDir(), { recursive: true })
  } catch (error) {
    log.error('updates directory unavailable', { message: error instanceof Error ? error.message : 'unknown' })
  }
}

export async function readRelease(): Promise<ReleaseInfo | null> {
  try {
    const raw = await readFile(path.join(updatesDir(), 'release.json'), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ReleaseInfo>
    if (!parsed.version || !parsed.filename || !parsed.releasedAt) return null
    return {
      version: parsed.version,
      notes: parsed.notes ?? '',
      filename: parsed.filename,
      size: Number(parsed.size) || 0,
      releasedAt: parsed.releasedAt,
    }
  } catch {
    return null
  }
}

export async function acceptInstaller(req: Request, version: string, notes: string, actor: Actor): Promise<ReleaseInfo> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new HttpError(400, 'VERSION', 'Версия указывается тремя числами, например 1.0.1.')
  }
  const current = await readRelease()
  if (current && !isNewerVersion(version, current.version)) {
    throw new HttpError(400, 'VERSION', `Новая версия должна быть выше ${current.version}.`)
  }
  const declared = Number(req.header('content-length') || 0)
  if (declared && (declared < MIN_BYTES || declared > MAX_BYTES)) {
    throw new HttpError(400, 'FILE', 'Нужен установщик Windows от 8 до 400 МБ.')
  }
  const dir = updatesDir()
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    throw new HttpError(500, 'UPDATES', 'Каталог обновлений недоступен. На сервере нужен том, примонтированный в /data.')
  }
  const filename = `Sheriff-MDT-Setup-${version}.exe`
  const tmp = path.join(dir, `${filename}.part`)
  const hash = createHash('sha512')
  let size = 0
  let checked = false
  const checker = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!checked && chunk.length > 0) {
        checked = true
        if (chunk[0] !== 0x4d || chunk[1] !== 0x5a) {
          callback(new HttpError(400, 'FILE', 'Нужен файл установщика Windows (.exe).'))
          return
        }
      }
      size += chunk.length
      if (size > MAX_BYTES) {
        callback(new HttpError(400, 'FILE', 'Файл установщика больше 400 МБ.'))
        return
      }
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  try {
    await pipeline(req, checker, createWriteStream(tmp))
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    const http = error instanceof HttpError ? error : nestedHttp(error)
    if (http) throw http
    throw new HttpError(400, 'FILE', 'Файл установщика не дошёл до сервера. Повторите отправку.')
  }
  if (!checked || size < MIN_BYTES) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw new HttpError(400, 'FILE', 'Файл слишком маленький для установщика Sheriff MDT.')
  }
  const sha512 = hash.digest('base64')
  await rm(path.join(dir, filename), { force: true }).catch(() => undefined)
  await rename(tmp, path.join(dir, filename))
  const releasedAt = new Date().toISOString()
  const info: ReleaseInfo = { version, notes: notes.slice(0, 500), filename, size, releasedAt }
  const yml = [
    `version: ${version}`,
    'files:',
    `  - url: ${filename}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${filename}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releasedAt}'`,
    '',
  ].join('\n')
  await writeFile(path.join(dir, 'latest.yml'), yml, 'utf8')
  await writeFile(path.join(dir, 'release.json'), JSON.stringify(info), 'utf8')
  const leftover = await readdir(dir)
  await Promise.all(
    leftover
      .filter((name) => name !== filename && (name.endsWith('.exe') || name.endsWith('.part')))
      .map((name) => rm(path.join(dir, name), { force: true })),
  )
  try {
    await prisma.$transaction((tx) =>
      audit(tx, actor, {
        action: 'release.publish',
        module: 'admin',
        recordId: version,
        reason: info.notes,
        newValues: { version, filename, size },
      }),
    )
  } catch (error) {
    log.error('release audit failed', { message: error instanceof Error ? error.message : 'unknown' })
  }
  publishRelease({ version, notes: info.notes })
  return info
}
