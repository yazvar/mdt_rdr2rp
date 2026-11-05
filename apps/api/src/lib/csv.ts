export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const filled = rows.filter((columns) => columns.some((column) => column.trim()))
  const header = filled.shift()
  if (!header) return []
  return filled.map((columns) => Object.fromEntries(header.map((key, index) => [key.trim(), (columns[index] ?? '').trim()])))
}

export function toCsv(rows: string[][]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  return `\uFEFF${rows.map((row) => row.map((value) => escape(value ?? '')).join(',')).join('\r\n')}`
}
