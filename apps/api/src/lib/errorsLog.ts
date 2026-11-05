import { prisma } from './prisma'

export async function logSystemError(source: string, error: unknown, path = ''): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const details = error instanceof Error ? (error.stack ?? '') : ''
  try {
    await prisma.systemError.create({
      data: {
        source,
        message: message.slice(0, 500),
        details: details.slice(0, 4000),
        path: path.slice(0, 200),
      },
    })
  } catch (persistError) {
    console.error(JSON.stringify({ level: 'error', message: 'failed to persist system error', persistError: String(persistError) }))
  }
}
