import { describe, expect, it } from 'vitest'

import {
  CUSTOM_FONT_FAMILY_VALUE,
  getTerminalFontFamilySelectValue,
  resolveTerminalFontFamily,
} from './terminalThemes'

describe('terminal font families', () => {
  it('resolves existing preset keys for backward compatibility', () => {
    expect(resolveTerminalFontFamily('default')).toContain('Menlo')
    expect(getTerminalFontFamilySelectValue('jetbrains-mono')).toBe(
      'jetbrains-mono'
    )
  })

  it('formats custom system font names with a monospace fallback', () => {
    expect(resolveTerminalFontFamily('Hack')).toBe('"Hack", monospace')
    expect(getTerminalFontFamilySelectValue('Hack')).toBe(
      CUSTOM_FONT_FAMILY_VALUE
    )
  })

  it('preserves advanced custom CSS font-family values', () => {
    expect(resolveTerminalFontFamily('"Iosevka", "SF Mono"')).toBe(
      '"Iosevka", "SF Mono", monospace'
    )
  })
})
