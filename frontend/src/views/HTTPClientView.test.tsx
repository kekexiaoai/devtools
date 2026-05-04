import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendHTTPRequest } from '@wailsjs/go/backend/App'
import { backend } from '@wailsjs/go/models'

import { primaryEnvStorageKey } from '@/lib/environment'
import { httpClientHistoryKey } from '@/lib/http-client'
import { HTTPClientView } from './HTTPClientView'

vi.mock('@wailsjs/go/backend/App', () => ({
  SendHTTPRequest: vi.fn(),
}))

describe('HTTPClientView', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps request and response as the primary workspace', () => {
    render(<HTTPClientView />)

    expect(screen.getByTestId('http-client-workspace').className).toContain(
      'xl:grid-cols-[minmax(460px,0.95fr)_minmax(560px,1.05fr)]'
    )
    expect(screen.getByTestId('http-request-panel')).toBeTruthy()
    expect(screen.getByTestId('http-response-panel')).toBeTruthy()
    expect(screen.getByText('Send a request to see the response.')).toBeTruthy()
  })

  it('uses compact panels with collapsible request editors', () => {
    render(<HTTPClientView />)

    expect(screen.getByTestId('http-request-panel-header').className).toContain(
      'px-4 py-3'
    )
    expect(
      screen.getByTestId('http-response-panel-header').className
    ).toContain('px-4 py-3')
    expect(screen.queryByPlaceholderText('Header-Name: value')).toBeNull()
    expect(screen.queryByPlaceholderText('Request body...')).toBeNull()

    fireEvent.click(screen.getByTestId('http-request-headers-trigger'))
    fireEvent.click(screen.getByTestId('http-request-body-trigger'))

    expect(screen.getByPlaceholderText('Header-Name: value')).toBeTruthy()
    expect(screen.getByPlaceholderText('Request body...')).toBeTruthy()
  })

  it('keeps history collapsed until requested', () => {
    render(<HTTPClientView />)

    expect(screen.queryByTestId('http-history-panel')).toBeNull()

    fireEvent.click(screen.getByTestId('http-history-trigger'))

    expect(screen.getByTestId('http-history-panel')).toBeTruthy()
    expect(screen.getByText('No requests sent yet.')).toBeTruthy()
  })

  it('opens history rows in a replay modal before loading the request', () => {
    window.localStorage.setItem(
      httpClientHistoryKey,
      JSON.stringify([
        {
          id: 'history-1',
          method: 'POST',
          url: 'https://api.example.com/users',
          headersText: 'Content-Type: application/json',
          body: '{"name":"Ada"}',
          timeoutSeconds: '10',
          statusCode: 201,
          durationMs: 42,
          createdAt: '2026-05-04T12:00:00.000Z',
        },
      ])
    )

    render(<HTTPClientView />)
    fireEvent.click(screen.getByTestId('http-history-trigger'))

    expect(screen.getByTestId('http-history-list')).toBeTruthy()

    fireEvent.click(screen.getByText('https://api.example.com/users'))

    expect(screen.getByText('Replay Request')).toBeTruthy()
    expect(
      screen.getByText(
        'Review the saved request before loading it into the editor.'
      )
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Load Request' }))

    expect(
      screen.getByDisplayValue('https://api.example.com/users')
    ).toBeTruthy()
    expect(
      screen.getByDisplayValue('Content-Type: application/json')
    ).toBeTruthy()
    expect(screen.getByDisplayValue('{"name":"Ada"}')).toBeTruthy()
    expect(screen.getByDisplayValue('10')).toBeTruthy()
  })

  it('saves current requests and loads them from the collection list', () => {
    render(<HTTPClientView />)

    fireEvent.change(
      screen.getByPlaceholderText('https://api.example.com/resource'),
      {
        target: { value: '{{BASE_URL}}/users' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save Request' }))

    expect(screen.getByText('GET {{BASE_URL}}/users')).toBeTruthy()

    fireEvent.change(
      screen.getByPlaceholderText('https://api.example.com/resource'),
      {
        target: { value: 'https://changed.example.com' },
      }
    )
    fireEvent.click(screen.getByText('GET {{BASE_URL}}/users'))

    expect(screen.getByDisplayValue('{{BASE_URL}}/users')).toBeTruthy()
  })

  it('resolves environment variables before sending requests', async () => {
    vi.mocked(SendHTTPRequest).mockResolvedValue(
      new backend.HTTPClientResponse({
        status: '200 OK',
        statusCode: 200,
        headers: [],
        body: '{}',
        durationMs: 10,
        sizeBytes: 2,
      })
    )
    window.localStorage.setItem(
      primaryEnvStorageKey,
      'BASE_URL=https://api.example.com\nTOKEN=abc'
    )

    render(<HTTPClientView />)
    fireEvent.change(
      screen.getByPlaceholderText('https://api.example.com/resource'),
      {
        target: { value: '{{BASE_URL}}/users' },
      }
    )
    fireEvent.click(screen.getByTestId('http-request-headers-trigger'))
    fireEvent.change(screen.getByPlaceholderText('Header-Name: value'), {
      target: { value: 'Authorization: Bearer {{TOKEN}}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByDisplayValue('{}')).toBeTruthy()
    expect(SendHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/users',
        headers: [expect.objectContaining({ value: 'Bearer abc' })],
      })
    )
  })
})
