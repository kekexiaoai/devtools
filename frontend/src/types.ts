export type UiScale = 'small' | 'default' | 'large'

export const toolIds = [
  'Dashboard',
  'FileSyncer',
  'JsonTools',
  'SshGate',
  'Tunnels',
  'Terminal',
] as const

export type ToolId = (typeof toolIds)[number]
