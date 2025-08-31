import React, { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import type { Shortcut } from '@/hooks/useSettingsStore'

interface ShortcutInputProps {
  value: Shortcut
  onChange: (shortcut: Shortcut) => void
  isMac: boolean
}

/**
 * Formats a shortcut object into a human-readable string.
 * e.g., { ctrl: true, key: 't' } -> "Ctrl + T"
 * On macOS, it uses the correct symbols like ⌘, ⌥, ⌃, ⇧.
 */
function formatShortcut(shortcut: Shortcut, isMac: boolean): string {
  if (!shortcut) return ''
  const parts: string[] = []
  if (isMac) {
    if (shortcut.meta) parts.push('⌘')
    if (shortcut.ctrl) parts.push('⌃')
    if (shortcut.alt) parts.push('⌥')
    if (shortcut.shift) parts.push('⇧')
  } else {
    // On Windows/Linux, we treat Ctrl and Meta as "Ctrl"
    if (shortcut.ctrl || shortcut.meta) parts.push('Ctrl')
    if (shortcut.alt) parts.push('Alt')
    if (shortcut.shift) parts.push('Shift')
  }

  let keyDisplay = shortcut.key.toUpperCase()
  if (keyDisplay.toLowerCase() === 'tab') keyDisplay = 'Tab'
  else if (keyDisplay === ' ') keyDisplay = 'Space'

  parts.push(keyDisplay)
  return parts.join(' + ')
}

/**
 * A controlled input component for capturing and displaying keyboard shortcuts.
 */
export function ShortcutInput({ value, onChange, isMac }: ShortcutInputProps) {
  const [isRecording, setIsRecording] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const displayValue = isRecording
    ? 'Press keys...'
    : formatShortcut(value, isMac)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    e.stopPropagation()

    // Ignore modifier-only keydowns
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return

    const newShortcut: Shortcut = {
      key: e.key,
      // On Mac, pressing Cmd sets both `meta: true` and `ctrl: true` in the stored
      // configuration. This acts as a special "CmdOrCtrl" flag. The event listener
      // in `TerminalView` is designed to recognize this flag and will trigger the
      // action for either `Cmd` (on Mac) or `Ctrl` (on Windows/Linux).
      ctrl: e.ctrlKey || (isMac && e.metaKey),
      meta: e.metaKey,
      alt: e.altKey,
      shift: e.shiftKey,
    }
    onChange(newShortcut)
    setIsRecording(false)
    inputRef.current?.blur()
  }

  return (
    <Input
      ref={inputRef}
      value={displayValue}
      onFocus={() => setIsRecording(true)}
      onBlur={() => setIsRecording(false)}
      onKeyDown={handleKeyDown}
      readOnly // Prevent manual typing
      className="text-center"
      placeholder="Click to set shortcut"
    />
  )
}
