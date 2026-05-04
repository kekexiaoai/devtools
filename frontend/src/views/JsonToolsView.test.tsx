import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DialogProvider } from '@/components/providers/DialogProvider'
import { JsonToolsView } from './JsonToolsView'

function renderJsonToolsView() {
  render(
    <DialogProvider>
      <JsonToolsView isDarkMode={false} />
    </DialogProvider>
  )
}

describe('JsonToolsView text tools', () => {
  it('shows JSON as a tool instead of a separate top-level category', () => {
    renderJsonToolsView()

    expect(screen.getByRole('tab', { name: 'JSON' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /Text Tools/i })).toBeNull()
  })

  it('keeps input isolated for each text tool page', () => {
    renderJsonToolsView()

    fireEvent.click(screen.getByRole('tab', { name: /Base64 Encode/i }))
    fireEvent.change(
      screen.getByPlaceholderText('Text to encode as Base64...'),
      {
        target: { value: 'hello' },
      }
    )
    fireEvent.click(screen.getByRole('tab', { name: /Base64 Decode/i }))

    expect(
      screen.getByPlaceholderText('Base64 text to decode...')
    ).toMatchObject({ value: '' })
  })

  it('does not show a Base64 error when opening decode with empty input', () => {
    renderJsonToolsView()

    fireEvent.click(screen.getByRole('tab', { name: /Base64 Decode/i }))
    fireEvent.click(screen.getByRole('button', { name: /Run/i }))

    expect(screen.queryByText('Invalid Base64 input.')).toBeNull()
    expect(
      screen.getByText('Enter input before running this tool.')
    ).toBeTruthy()
  })

  it('shows a dedicated timestamp converter workspace', () => {
    renderJsonToolsView()

    fireEvent.click(screen.getByRole('tab', { name: /Timestamp/i }))

    expect(screen.getByText('Input Format')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Now/i })).toBeTruthy()
    expect(screen.getByText('Unix Seconds')).toBeTruthy()
    expect(screen.getByText('Unix Microseconds')).toBeTruthy()
    expect(screen.getByText('RFC 2822')).toBeTruthy()
    expect(screen.getByText('SQL UTC')).toBeTruthy()
    expect(screen.getByText('UTC')).toBeTruthy()
    expect(screen.getByText('Relative')).toBeTruthy()
    expect(screen.getByLabelText('Timestamp Input').tagName).toBe('INPUT')
  })
})
