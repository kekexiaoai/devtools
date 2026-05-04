export const settingsBackupStorageKeys = [
  'devtools-settings-storage',
  'devtools:ssh-host-metadata',
  'devtools:tunnel-tags',
  'devtools:terminal-snippets',
] as const

export type SettingsBackupStorageKey =
  (typeof settingsBackupStorageKeys)[number]

export interface SettingsBackup {
  version: 1
  exportedAt: string
  entries: Partial<Record<SettingsBackupStorageKey, string>>
}

export function createSettingsBackup(
  storage: Storage,
  now = new Date()
): SettingsBackup {
  const entries: SettingsBackup['entries'] = {}

  settingsBackupStorageKeys.forEach((key) => {
    const value = storage.getItem(key)
    if (value !== null) {
      entries[key] = value
    }
  })

  return {
    version: 1,
    exportedAt: now.toISOString(),
    entries,
  }
}

export function restoreSettingsBackup(backup: unknown, storage: Storage): void {
  if (!isSettingsBackup(backup)) {
    throw new Error('Invalid settings backup file.')
  }

  settingsBackupStorageKeys.forEach((key) => {
    const value = backup.entries[key]
    if (typeof value === 'string') {
      storage.setItem(key, value)
    }
  })
}

export function parseSettingsBackupText(value: string): SettingsBackup {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isSettingsBackup(parsed)) {
      throw new Error('Invalid settings backup file.')
    }
    return parsed
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Invalid settings backup file.')
  }
}

function isSettingsBackup(value: unknown): value is SettingsBackup {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1) return false
  if (typeof candidate.exportedAt !== 'string') return false
  if (!candidate.entries || typeof candidate.entries !== 'object') return false
  return true
}
