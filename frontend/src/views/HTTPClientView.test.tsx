import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HTTPClientView } from './HTTPClientView'

vi.mock('@wailsjs/go/backend/App', () => ({
  SendHTTPRequest: vi.fn(),
}))

describe('HTTPClientView', () => {
  it('keeps request and response as the primary workspace', () => {
    render(<HTTPClientView />)

    expect(screen.getByTestId('http-client-workspace').className).toContain(
      'xl:grid-cols-[minmax(460px,0.95fr)_minmax(560px,1.05fr)]'
    )
    expect(screen.getByTestId('http-request-panel')).toBeTruthy()
    expect(screen.getByTestId('http-response-panel')).toBeTruthy()
    expect(screen.getByText('Send a request to see the response.')).toBeTruthy()
  })

  it('keeps history collapsed until requested', () => {
    render(<HTTPClientView />)

    expect(screen.queryByTestId('http-history-panel')).toBeNull()

    fireEvent.click(screen.getByTestId('http-history-trigger'))

    expect(screen.getByTestId('http-history-panel')).toBeTruthy()
    expect(screen.getByText('No requests sent yet.')).toBeTruthy()
  })
})
