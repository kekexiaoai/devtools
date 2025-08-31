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
    // For display on Mac, Cmd (meta) takes precedence.
    // This correctly handles the "CmdOrCtrl" flag from default shortcuts
    // (where both meta and ctrl are true) by only showing the Cmd symbol.
    if (shortcut.meta) parts.push('⌘')
    // Only show the Ctrl symbol if Meta is not also present.
    else if (shortcut.ctrl) parts.push('⌃')
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

    // --- Validation ---
    // A valid shortcut must include at least one primary modifier (Ctrl, Meta, Alt).
    // This prevents single keys (e.g., "A") or Shift-only combinations
    // (e.g., "Shift + A") from being registered, as they would interfere
    // with normal typing.
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      return // Ignore invalid shortcut attempt
    }

    const newShortcut: Shortcut = {
      key: e.key,
      // Record the keys exactly as they were pressed. This provides maximum
      // flexibility, allowing users to set Mac-specific Ctrl-only shortcuts
      // that are distinct from Cmd-shortcuts.
      ctrl: e.ctrlKey,
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
