import React, { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import type { Shortcut, ShortcutAction } from '@/hooks/useSettingsStore'
import { cn } from '@/lib/utils'

interface ShortcutInputProps {
  value: Shortcut
  onChange: (shortcut: Shortcut) => void
  isMac: boolean
  // For conflict detection
  actionId: ShortcutAction
  allShortcuts: Record<ShortcutAction, Shortcut>
  shortcutActions: { id: ShortcutAction; name: string }[]
}

// A list of single-character keys for Ctrl combinations that are commonly
// used in shells and should be protected from being overridden by global shortcuts.
const PROTECTED_CTRL_KEYS = new Set([
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'k',
  'l',
  'u',
  'w',
])

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

function areShortcutsSemanticallyEqual(s1: Shortcut, s2: Shortcut): boolean {
  // Step 1: Check for immediate mismatches. If the main key, Alt, or Shift
  // states are different, the shortcuts are not equal.
  if (s1.key.toLowerCase() !== s2.key.toLowerCase()) return false
  if (s1.alt !== s2.alt) return false
  if (s1.shift !== s2.shift) return false

  // Step 2: Handle the special "CmdOrCtrl" case.
  // This logic is only reached if the keys from Step 1 are identical.
  const s1IsCmdOrCtrl = s1.ctrl && s1.meta
  const s2IsCmdOrCtrl = s2.ctrl && s2.meta

  // If both are the generic "CmdOrCtrl" type, they are equivalent.
  if (s1IsCmdOrCtrl && s2IsCmdOrCtrl) return true // Both are CmdOrCtrl
  if (s1IsCmdOrCtrl) return s2.ctrl || s2.meta // s1 is CmdOrCtrl, check if s2 matches either
  if (s2IsCmdOrCtrl) return s1.ctrl || s1.meta // s2 is CmdOrCtrl, check if s1 matches either

  // Step 3: If neither is a "CmdOrCtrl" type, perform a strict comparison.
  return s1.ctrl === s2.ctrl && s1.meta === s2.meta
}

/**
 * A controlled input component for capturing and displaying keyboard shortcuts.
 */
export function ShortcutInput({
  value,
  onChange,
  isMac,
  actionId,
  allShortcuts,
  shortcutActions,
}: ShortcutInputProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const displayValue = isRecording
    ? 'Press keys...'
    : formatShortcut(value, isMac)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent the browser's default action (e.g., typing 't' in the input)
    // and stop the event from bubbling up to other listeners.
    e.preventDefault()
    e.stopPropagation()

    // --- Why this check is necessary ---
    // When a user presses a modifier key like `Ctrl`, the browser fires a `keydown`
    // event where `e.key` is "Control". We want to ignore these "modifier-only"
    // events and wait for the event that includes the main key (e.g., "t" in "Ctrl+T").
    // This line ensures we only process complete shortcut combinations.
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return

    // --- Validation ---
    // A valid shortcut must include at least one primary modifier (Ctrl, Meta, Alt).
    // This prevents single keys (e.g., "A") or Shift-only combinations
    // (e.g., "Shift + A") from being registered, as they would interfere
    // with normal typing.
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      setValidationError('Shortcut must include Ctrl, Alt, or Cmd/Win.')
      return
    }

    // --- Terminal Conflict Validation ---
    // On non-Mac systems, `Ctrl` is the primary terminal modifier.
    // On Mac, `Cmd` is for the app, but `Ctrl` is still heavily used by the terminal.
    // Therefore, we protect common Ctrl shortcuts on ALL platforms.
    // We only apply this check if `meta` is NOT pressed, to allow `Cmd+Ctrl` combinations.
    if (
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey &&
      PROTECTED_CTRL_KEYS.has(e.key.toLowerCase())
    ) {
      setValidationError(
        `Ctrl+${e.key.toUpperCase()} is reserved for terminal use.`
      )
      return
    }

    // --- Creating the Shortcut Object ---
    // At this point, we know a non-modifier key was pressed. We can now read
    // the state of all modifier keys from the event object (`e`) to build our shortcut.
    // - e.key: The main key pressed (e.g., "t", "w", "Tab"). This is a native browser property.
    // - e.ctrlKey, e.metaKey, etc.: Booleans indicating if the corresponding
    //   modifier key was held down *during* this event. These are also native browser properties.
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

    // --- Conflict Detection ---
    for (const [otherActionId, otherShortcut] of Object.entries(allShortcuts)) {
      if (
        otherActionId !== actionId &&
        areShortcutsSemanticallyEqual(newShortcut, otherShortcut)
      ) {
        const actionName =
          shortcutActions.find((a) => a.id === otherActionId)?.name ||
          otherActionId
        setValidationError(`Already used by "${actionName}".`)
        return
      }
    }

    setValidationError(null) // Clear previous errors
    onChange(newShortcut)
    setIsRecording(false)
    inputRef.current?.blur()
  }

  return (
    <div>
      <Input
        ref={inputRef}
        value={displayValue}
        onFocus={() => {
          setIsRecording(true)
          setValidationError(null)
        }}
        onBlur={() => {
          setIsRecording(false)
          setValidationError(null)
        }}
        onKeyDown={handleKeyDown}
        readOnly // Prevent manual typing
        className={cn(
          'text-center w-full',
          validationError &&
            'ring-1 ring-destructive focus-visible:ring-destructive'
        )}
        placeholder="Click to set shortcut"
      />
      {validationError && (
        <p className="text-[11px] text-destructive mt-1.5 px-1">
          {validationError}
        </p>
      )}
    </div>
  )
}
