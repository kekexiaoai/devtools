import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HTTPClientView } from './HTTPClientView'

vi.mock('@wailsjs/go/backend/App', () => ({
  SendHTTPRequest: vi.fn(),
}))

describe('HTTPClientView', () => {
  it('keeps history, request, and response in separate panels', () => {
    render(<HTTPClientView />)

    expect(screen.getByTestId('http-client-workspace').className).toContain(
      'xl:grid-cols-[18rem_minmax(440px,0.9fr)_minmax(520px,1.1fr)]'
    )
    expect(screen.getByTestId('http-history-panel')).toBeTruthy()
    expect(screen.getByTestId('http-request-panel')).toBeTruthy()
    expect(screen.getByTestId('http-response-panel')).toBeTruthy()
    expect(screen.getByText('No requests sent yet.')).toBeTruthy()
    expect(screen.getByText('Send a request to see the response.')).toBeTruthy()
  })
})
