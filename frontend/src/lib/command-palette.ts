import type React from 'react'

export interface CommandPaletteItem {
  id: string
  title: string
  group: string
  keywords?: string[]
  disabled?: boolean
  icon?: React.ReactNode
  run: () => void
}

export function filterCommands(
  commands: CommandPaletteItem[],
  query: string
): CommandPaletteItem[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  if (tokens.length === 0) {
    return commands
  }

  return commands.filter((command) => {
    const searchableText = [
      command.title,
      command.group,
      ...(command.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase()

    return tokens.every((token) => searchableText.includes(token))
  })
}
