export function zonedStart(now: Date, offsetMinutes: number, unit: 'day' | 'week' | 'month'): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth()
  const date = shifted.getUTCDate()
  let startUtc: number
  if (unit === 'month') {
    startUtc = Date.UTC(year, month, 1) - offsetMinutes * 60_000
  } else if (unit === 'week') {
    const day = shifted.getUTCDay()
    const mondayOffset = day === 0 ? 6 : day - 1
    startUtc = Date.UTC(year, month, date - mondayOffset) - offsetMinutes * 60_000
  } else {
    startUtc = Date.UTC(year, month, date) - offsetMinutes * 60_000
  }
  return new Date(startUtc)
}

export function zonedEnd(start: Date, unit: 'day' | 'week' | 'month', offsetMinutes: number): Date {
  if (unit === 'day') return new Date(start.getTime() + 24 * 60 * 60_000)
  if (unit === 'week') return new Date(start.getTime() + 7 * 24 * 60 * 60_000)
  const shifted = new Date(start.getTime() + offsetMinutes * 60_000)
  const next = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - offsetMinutes * 60_000
  return new Date(next)
}
