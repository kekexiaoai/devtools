import { describe, expect, it } from 'vitest'

import { parseHTTPHeadersText } from './http-client'

describe('http client helpers', () => {
  it('parses HTTP header text', () => {
    expect(
      parseHTTPHeadersText('Content-Type: application/json\nX-Token: abc')
    ).toMatchObject([
      { name: 'Content-Type', value: 'application/json' },
      { name: 'X-Token', value: 'abc' },
    ])
  })

  it('rejects malformed header lines', () => {
    expect(() => parseHTTPHeadersText('bad header')).toThrow(
      'Headers must use "Name: value" format.'
    )
  })
})
