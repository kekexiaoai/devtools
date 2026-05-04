import { describe, expect, it } from 'vitest'

import {
  applyEnvTemplate,
  diffEnvEntries,
  formatEnvEntries,
  parseEnvText,
} from './environment'

describe('environment helpers', () => {
  it('parses env text and marks duplicate keys', () => {
    const result = parseEnvText(
      'API_URL=https://example.com\nexport DEBUG=true\nAPI_URL=local'
    )

    expect(result.entries).toMatchObject([
      { key: 'API_URL', value: 'https://example.com', duplicate: true },
      { key: 'DEBUG', value: 'true', duplicate: false },
      { key: 'API_URL', value: 'local', duplicate: true },
    ])
    expect(result.issues).toMatchObject([
      { line: 3, message: 'Duplicate key "API_URL".' },
    ])
  })

  it('formats env entries in stable key order', () => {
    const result = parseEnvText('B=two words\nA=1')

    expect(formatEnvEntries(result.entries)).toBe('A=1\nB="two words"')
  })

  it('diffs env entries by key', () => {
    const left = parseEnvText('A=1\nB=2').entries
    const right = parseEnvText('A=1\nB=3\nC=4').entries

    expect(diffEnvEntries(left, right)).toEqual([
      { key: 'B', left: '2', right: '3', type: 'changed' },
      { key: 'C', right: '4', type: 'added' },
    ])
  })

  it('applies double-brace environment variables to text', () => {
    const env = parseEnvText(
      'BASE_URL=https://api.example.com\nTOKEN=abc'
    ).entries

    expect(
      applyEnvTemplate(
        '{{BASE_URL}}/users\nAuthorization: Bearer {{TOKEN}}',
        env
      )
    ).toBe('https://api.example.com/users\nAuthorization: Bearer abc')
  })
})
