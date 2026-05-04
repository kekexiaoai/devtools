import { describe, expect, it } from 'vitest'
import {
  createSettingsBackup,
  restoreSettingsBackup,
  settingsBackupStorageKeys,
} from './settings-backup'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length() {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

describe('settings backup', () => {
  it('exports only known settings keys', () => {
    const storage = new MemoryStorage()
    storage.setItem('devtools-settings-storage', '{"state":{"theme":"dark"}}')
    storage.setItem('unrelated', 'ignore')

    const backup = createSettingsBackup(
      storage,
      new Date('2030-01-01T00:00:00.000Z')
    )

    expect(backup).toEqual({
      version: 1,
      exportedAt: '2030-01-01T00:00:00.000Z',
      entries: {
        'devtools-settings-storage': '{"state":{"theme":"dark"}}',
      },
    })
  })

  it('restores known settings keys and ignores unknown keys', () => {
    const storage = new MemoryStorage()

    restoreSettingsBackup(
      {
        version: 1,
        exportedAt: '2030-01-01T00:00:00.000Z',
        entries: {
          'devtools-settings-storage': 'settings',
          'devtools:ssh-host-metadata': 'hosts',
          unknown: 'ignored',
        },
      },
      storage
    )

    expect(storage.getItem('devtools-settings-storage')).toBe('settings')
    expect(storage.getItem('devtools:ssh-host-metadata')).toBe('hosts')
    expect(storage.getItem('unknown')).toBeNull()
  })

  it('exposes the backed up key list', () => {
    expect(settingsBackupStorageKeys).toContain('devtools-settings-storage')
    expect(settingsBackupStorageKeys).toContain('devtools:terminal-snippets')
  })
})
