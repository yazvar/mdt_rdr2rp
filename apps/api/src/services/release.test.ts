import { describe, expect, it } from 'vitest'
import { isNewerVersion } from './release'

describe('release version', () => {
  it('принимает только более новую тройку чисел', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', '1.2.0')).toBe(false)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true)
  })
})
