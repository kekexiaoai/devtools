import { describe, expect, it } from 'vitest'
import {
  convertUnixTimestamp,
  decodeBase64Text,
  decodeUrlText,
  decodeJwt,
  encodeBase64Text,
  encodeUrlText,
  generateUuidV4,
  hashText,
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

  it('hashes text with MD5 and SHA-256', async () => {
    await expect(hashText('hello', 'MD5')).resolves.toBe(
      '5d41402abc4b2a76b9719d911017c592'
    )
    await expect(hashText('hello', 'SHA-256')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
  })

  it('decodes unsigned JWT payloads', () => {
    const token = [
      encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
      encodeBase64Url(JSON.stringify({ sub: 'user-1', exp: 1893456000 })),
      '',
    ].join('.')

    expect(decodeJwt(token)).toMatchObject({
      header: { alg: 'none', typ: 'JWT' },
      payload: { sub: 'user-1', exp: 1893456000 },
      expiresAt: '2030-01-01T00:00:00.000Z',
    })
  })

  it('converts unix timestamps in seconds and milliseconds', () => {
    expect(convertUnixTimestamp('1893456000').utc).toBe(
      '2030-01-01T00:00:00.000Z'
    )
    expect(convertUnixTimestamp('1893456000000').seconds).toBe(1893456000)
  })

  it('generates UUID v4 values', () => {
    const ids = generateUuidV4(2)

    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })
})

function encodeBase64Url(value: string): string {
  return encodeBase64Text(value)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
