import '../src/env'
import { prisma } from '../src/lib/prisma'
import { purgeReleaseData } from '../src/services/purgeRelease'

function assertLocalDatabase(): void {
  const raw = process.env.DATABASE_URL ?? ''
  if (!raw) throw new Error('DATABASE_URL не задан.')
  const host = new URL(raw.replace(/^postgresql:/, 'http:')).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error('Очистка разрешена только для базы на этом компьютере.')
  }
}

async function main() {
  assertLocalDatabase()
  const result = await purgeReleaseData()
  console.log(JSON.stringify(result))
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Очистка не выполнена.')
  await prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
