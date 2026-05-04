import { describe, expect, it } from 'vitest'
import { backend } from '@wailsjs/go/models'

import {
  createHTTPClientHistoryItem,
  createHTTPSavedRequest,
  parseHTTPHeadersText,
} from './http-client'

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

  it('stores request details in HTTP history items', () => {
    const item = createHTTPClientHistoryItem(
      'POST',
      'https://api.example.com/users',
      new backend.HTTPClientResponse({
        statusCode: 201,
        durationMs: 42,
      }),
      {
        headersText: 'Content-Type: application/json',
        body: '{"name":"Ada"}',
        timeoutSeconds: '10',
      }
    )

    expect(item).toMatchObject({
      method: 'POST',
      url: 'https://api.example.com/users',
      headersText: 'Content-Type: application/json',
      body: '{"name":"Ada"}',
      timeoutSeconds: '10',
      statusCode: 201,
      durationMs: 42,
    })
  })

  it('creates saved requests with complete editable request details', () => {
    const saved = createHTTPSavedRequest({
      name: 'List users',
      method: 'GET',
      url: '{{BASE_URL}}/users',
      headersText: 'Authorization: Bearer {{TOKEN}}',
      body: '',
      timeoutSeconds: '15',
    })

    expect(saved).toMatchObject({
      name: 'List users',
      method: 'GET',
      url: '{{BASE_URL}}/users',
      headersText: 'Authorization: Bearer {{TOKEN}}',
      body: '',
      timeoutSeconds: '15',
    })
  })
})
