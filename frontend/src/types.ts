export type UiScale = 'small' | 'default' | 'large'

export const toolIds = [
  'Dashboard',
  'FileSyncer',
  'JsonTools',
  'SshGate',
  'Tunnels',
  'Terminal',
  'Diagnostics',
  'HTTPClient',
  'PortMonitor',
  'Environment',
] as const

export type ToolId = (typeof toolIds)[number]
