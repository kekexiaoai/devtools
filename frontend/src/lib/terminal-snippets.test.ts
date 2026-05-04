import { describe, expect, it } from 'vitest'
import {
  createTerminalSnippet,
  deleteTerminalSnippet,
  normalizeTerminalSnippets,
  updateTerminalSnippet,
} from './terminal-snippets'

describe('terminal snippets', () => {
  it('normalizes snippets and removes invalid entries', () => {
    expect(
      normalizeTerminalSnippets([
        { id: 'a', name: '  List ', command: ' ls -la ' },
        { id: '', name: 'bad', command: 'echo bad' },
        { id: 'b', name: '', command: 'echo bad' },
      ])
    ).toEqual([{ id: 'a', name: 'List', command: 'ls -la' }])
  })

  it('creates snippets with stable required fields', () => {
    expect(createTerminalSnippet('Disk Usage', 'df -h')).toMatchObject({
      name: 'Disk Usage',
      command: 'df -h',
    })
  })

  it('updates and deletes snippets by id', () => {
    const snippets = [
      { id: 'one', name: 'One', command: 'echo one' },
      { id: 'two', name: 'Two', command: 'echo two' },
    ]

    expect(
      updateTerminalSnippet(snippets, {
        id: 'two',
        name: 'Second',
        command: 'echo 2',
      })
    ).toEqual([
      { id: 'one', name: 'One', command: 'echo one' },
      { id: 'two', name: 'Second', command: 'echo 2' },
    ])

    expect(deleteTerminalSnippet(snippets, 'one')).toEqual([
      { id: 'two', name: 'Two', command: 'echo two' },
    ])
  })
})
