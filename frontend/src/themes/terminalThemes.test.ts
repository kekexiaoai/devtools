import { describe, expect, it } from 'vitest'

import {
  CUSTOM_FONT_FAMILY_VALUE,
  getFilteredTerminalFontFamilyLabel,
  getTerminalFontFamilyOptions,
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
    expect(resolveTerminalFontFamily('CommitMono')).toBe(
      '"CommitMono", monospace'
    )
    expect(getTerminalFontFamilySelectValue('CommitMono')).toBe(
      CUSTOM_FONT_FAMILY_VALUE
    )
  })

  it('preserves advanced custom CSS font-family values', () => {
    expect(resolveTerminalFontFamily('"Iosevka", "SF Mono"')).toBe(
      '"Iosevka", "SF Mono", monospace'
    )
  })

  it('filters known font families by searchable text', () => {
    expect(
      getTerminalFontFamilyOptions('cascadia').map((font) => font.key)
    ).toEqual(['cascadia-code', 'cascadia-mono'])
  })

  it('includes searchable system font families', () => {
    expect(
      getTerminalFontFamilyOptions('meslolgm', ['MesloLGM Nerd Font']).map(
        (font) => font.name
      )
    ).toEqual(['MesloLGM Nerd Font'])
  })

  it('shows preset labels and custom font names', () => {
    expect(getFilteredTerminalFontFamilyLabel('sf-mono')).toBe('SF Mono')
    expect(getFilteredTerminalFontFamilyLabel('CommitMono')).toBe('CommitMono')
  })
})
