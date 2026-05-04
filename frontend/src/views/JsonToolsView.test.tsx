import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DialogProvider } from '@/components/providers/DialogProvider'
import { JsonToolsView } from './JsonToolsView'

function renderJsonToolsView() {
  render(
    <DialogProvider>
      <JsonToolsView defaultTab="text" isDarkMode={false} />
    </DialogProvider>
  )
}

describe('JsonToolsView text tools', () => {
  it('keeps input isolated for each text tool page', () => {
    renderJsonToolsView()

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
})
