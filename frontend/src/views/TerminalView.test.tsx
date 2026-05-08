import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TerminalSession } from '@/App'
import { TerminalView } from './TerminalView'

const integratedTerminalMock = vi.fn()

vi.mock('@/components/sshgate/IntegratedTerminal', () => ({
  IntegratedTerminal: (props: { displayName: string; platform?: string }) => {
    integratedTerminalMock(props)
    return <div data-testid="integrated-terminal">{props.displayName}</div>
  },
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock
})

beforeEach(() => {
  integratedTerminalMock.mockClear()
})

function createSession(
  id: string,
  displayName: string,
  alias = displayName,
  type: 'local' | 'remote' = 'local'
): TerminalSession {
  return {
    id,
    alias,
    type,
    url: `ws://localhost/terminal/${id}`,
    displayName,
    status: 'connected',
  }
}

function renderTerminalView() {
  const props = {
    terminalSessions: [
      createSession('terminal-1', 'local'),
      createSession('terminal-2', 'local (2)', 'local (2)', 'local'),
      createSession('terminal-3', 'bastion', 'bastion', 'remote'),
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
  it('passes platform through to integrated terminals', () => {
    renderTerminalView()

    expect(integratedTerminalMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ displayName: 'local', platform: 'darwin' })
    )
  })

  it('uses the session type instead of alias to classify terminals', () => {
    const props = {
      terminalSessions: [
        createSession('terminal-4', 'jumpbox', 'local', 'remote'),
      ],
      activeTerminalId: 'terminal-4',
      onActiveTerminalChange: vi.fn(),
      onCloseTerminal: vi.fn(),
      onConnect: vi.fn(),
      onReconnectTerminal: vi.fn(),
      onRenameTerminal: vi.fn(),
      onStatusChange: vi.fn(),
      isActive: true,
      isDarkMode: false,
      platform: 'windows',
    }

    render(<TerminalView {...props} />)

    expect(integratedTerminalMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ sessionType: 'remote' })
    )
  })

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
