import { describe, expect, it } from 'vitest'
import { filterCommands, type CommandPaletteItem } from './command-palette'

const commands: CommandPaletteItem[] = [
  {
    id: 'navigate-dashboard',
    title: 'Dashboard',
    group: 'Navigate',
    keywords: ['home', 'overview'],
    run: () => {},
  },
  {
    id: 'start-profile-backend',
    title: 'Start Profile: Backend',
    group: 'Profiles',
    keywords: ['workspace', 'tunnel'],
    run: () => {},
  },
  {
    id: 'start-tunnel-db',
    title: 'Start Tunnel: Database',
    group: 'Tunnels',
    keywords: ['ssh', 'postgres'],
    run: () => {},
  },
]

describe('filterCommands', () => {
  it('returns all commands for an empty query', () => {
    expect(filterCommands(commands, '')).toHaveLength(commands.length)
  })

  it('matches title, group, and keywords without case sensitivity', () => {
    expect(filterCommands(commands, 'backend')).toHaveLength(1)
    expect(filterCommands(commands, 'profiles')[0].id).toBe(
      'start-profile-backend'
    )
    expect(filterCommands(commands, 'POSTGRES')[0].id).toBe('start-tunnel-db')
  })

  it('requires every query token to match the command text', () => {
    const result = filterCommands(commands, 'start database')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('start-tunnel-db')
  })
})
