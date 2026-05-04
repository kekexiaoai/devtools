import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { TerminalSession } from '@/App'
import { TerminalView } from './TerminalView'

vi.mock('@/components/sshgate/IntegratedTerminal', () => ({
  IntegratedTerminal: ({ displayName }: { displayName: string }) => (
    <div data-testid="integrated-terminal">{displayName}</div>
  ),
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock
})

function createSession(
  id: string,
  displayName: string,
  alias = displayName
): TerminalSession {
  return {
    id,
    alias,
    type: 'local',
    url: `ws://localhost/terminal/${id}`,
    displayName,
    status: 'connected',
  }
}

function renderTerminalView() {
  const props = {
    terminalSessions: [
      createSession('terminal-1', 'local'),
      createSession('terminal-2', 'local (2)'),
      createSession('terminal-3', 'bastion'),
    ],
    activeTerminalId: 'terminal-1',
    onActiveTerminalChange: vi.fn(),
    onCloseTerminal: vi.fn(),
    onConnect: vi.fn(),
    onReconnectTerminal: vi.fn(),
    onRenameTerminal: vi.fn(),
    onStatusChange: vi.fn(),
    isActive: true,
    isDarkMode: false,
    platform: 'darwin',
  }

  render(<TerminalView {...props} />)
  return props
}

describe('TerminalView split panes', () => {
  it('lets the user choose which terminal to split with', async () => {
    renderTerminalView()

    fireEvent.pointerDown(screen.getByTitle('Split Terminal'))

    expect(await screen.findByText('Split current with')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'local (2)' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'bastion' })).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitem', { name: 'bastion' }))

    expect(screen.getByTitle('Change Split Terminal')).toBeTruthy()
    expect(screen.getByTitle('Close Split')).toBeTruthy()
  })
})
