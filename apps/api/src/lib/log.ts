export const log = {
  info(message: string, extra?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', message, ...extra, time: new Date().toISOString() }))
  },
  error(message: string, extra?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: 'error', message, ...extra, time: new Date().toISOString() }))
  },
}
