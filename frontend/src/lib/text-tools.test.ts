import { describe, expect, it } from 'vitest'
import {
  decodeBase64Text,
  decodeUrlText,
  encodeBase64Text,
  encodeUrlText,
} from './text-tools'

describe('text tools', () => {
  it('encodes and decodes UTF-8 Base64 text', () => {
    const encoded = encodeBase64Text('hello 你好')

    expect(encoded).toBe('aGVsbG8g5L2g5aW9')
    expect(decodeBase64Text(encoded)).toBe('hello 你好')
  })

  it('rejects invalid Base64 input', () => {
    expect(() => decodeBase64Text('not valid !!!')).toThrow(
      'Invalid Base64 input.'
    )
  })

  it('encodes and decodes URL text', () => {
    const encoded = encodeUrlText('name=dev tools&tag=隧道')

    expect(encoded).toBe('name%3Ddev%20tools%26tag%3D%E9%9A%A7%E9%81%93')
    expect(decodeUrlText(encoded)).toBe('name=dev tools&tag=隧道')
  })

  it('rejects malformed URL encoded text', () => {
    expect(() => decodeUrlText('%E0%A4%A')).toThrow(
      'Invalid URL encoded input.'
    )
  })
})
