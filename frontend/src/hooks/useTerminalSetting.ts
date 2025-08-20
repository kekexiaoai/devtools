import { useState, useCallback } from 'react'

/**
 * A custom hook to manage a setting that can be overridden locally.
 * It gracefully handles a global value (from props), a local override (from state),
 * and a final default value.
 *
 * @template T The type of the setting value.
 * @param {T | undefined} globalValue The value passed from a parent component (e.g., global settings).
 * @param {T} defaultValue The ultimate fallback value if both global and local are not set.
 * @returns An object containing the effective value and methods to manage the local override.
 */
export function useTerminalSetting<T>(
  globalValue: T | undefined,
  defaultValue: T
) {
  const [localValue, setLocalValue] = useState<T | null>(null)

  const effectiveValue = localValue ?? globalValue ?? defaultValue
  const isOverridden = localValue !== null

  const reset = useCallback(() => {
    setLocalValue(null)
  }, [])

  return { effectiveValue, setLocalValue, isOverridden, reset }
}
