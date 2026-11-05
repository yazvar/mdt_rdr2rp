import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from './csv'
import { assertBackup, BACKUP_FORMAT } from '../services/backup'
import { HttpError } from './http'

describe('csv', () => {
  it('читает кавычки и собирает файл для Excel', () => {
    const rows = parseCsv('articleNumber,title\n"ТЕСТ-1","Статья, с запятой"\n')
    expect(rows).toEqual([{ articleNumber: 'ТЕСТ-1', title: 'Статья, с запятой' }])
    expect(toCsv([['Имя', 'Сумма'], ['Кроу', '10']]).charCodeAt(0)).toBe(0xfeff)
  })
})

describe('архив', () => {
  it('отклоняет чужой формат', () => {
    expect(() => assertBackup({ format: 'other', checksum: 'x', tables: {} })).toThrow(HttpError)
    expect(() => assertBackup({ format: BACKUP_FORMAT, checksum: 'abc', tables: { employee: [] } })).not.toThrow()
  })
})
