import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { filterCommands, type CommandPaletteItem } from '@/lib/command-palette'
import { Search } from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: CommandPaletteItem[]
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredCommands = useMemo(() => {
    return filterCommands(commands, query)
  }, [commands, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
      return
    }

    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const runCommand = (command: CommandPaletteItem) => {
    if (command.disabled) return

    command.run()
    onOpenChange(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredCommands.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) => (current + 1) % filteredCommands.length)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) =>
        current === 0 ? filteredCommands.length - 1 : current - 1
      )
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runCommand(filteredCommands[selectedIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>
            Search and run DevTools commands.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {filteredCommands.length > 0 ? (
            <div className="space-y-1">
              {filteredCommands.map((command, index) => (
                <Button
                  key={command.id}
                  type="button"
                  variant={index === selectedIndex ? 'secondary' : 'ghost'}
                  className="h-auto w-full justify-start gap-3 px-3 py-2 text-left"
                  disabled={command.disabled}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => runCommand(command)}
                >
                  {command.icon && (
                    <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                      {command.icon}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {command.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {command.group}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No commands found.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
