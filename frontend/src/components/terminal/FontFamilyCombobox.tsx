import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { ListSystemFonts } from '@wailsjs/go/backend/App'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  FONT_FAMILIES,
  getFilteredTerminalFontFamilyLabel,
  getTerminalFontFamilyOptions,
  getTerminalFontFamilySelectValue,
} from '@/themes/terminalThemes'

type FontFamilyComboboxProps = {
  id?: string
  value?: string | null
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

let systemFontsCache: string[] | null = null
let systemFontsPromise: Promise<string[]> | null = null

export function FontFamilyCombobox({
  id,
  value,
  onChange,
  className,
  placeholder = 'Search or enter font...',
}: FontFamilyComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const options = useMemo(
    () => getTerminalFontFamilyOptions(query, systemFonts),
    [query, systemFonts]
  )
  const selectValue = getTerminalFontFamilySelectValue(value)
  const customValue = query.trim()
  const normalizedCustomValue = customValue.toLowerCase()
  const canUseCustom =
    customValue.length > 0 &&
    !Object.values(FONT_FAMILIES).some(
      (font) => font.name.toLowerCase() === normalizedCustomValue
    ) &&
    !Object.keys(FONT_FAMILIES).some(
      (key) => key.toLowerCase() === normalizedCustomValue
    ) &&
    !Object.values(FONT_FAMILIES).some(
      (font) => font.value.toLowerCase() === normalizedCustomValue
    )

  const choose = (nextValue: string) => {
    onChange(nextValue)
    setQuery('')
    setOpen(false)
  }

  useEffect(() => {
    let cancelled = false

    loadSystemFonts()
      .then((fonts) => {
        if (!cancelled) {
          setSystemFonts(fonts)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSystemFonts([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate">
            {getFilteredTerminalFontFamilyLabel(value)}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="end">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto">
          {options.map((font) => (
            <button
              key={font.key}
              type="button"
              className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={() => choose(font.key)}
            >
              <span className="truncate">{font.name}</span>
              <Check
                className={cn(
                  'h-4 w-4',
                  selectValue === font.key ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          ))}

          {canUseCustom && (
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={() => choose(customValue)}
            >
              Use "{customValue}"
            </button>
          )}

          {options.length === 0 && !canUseCustom && (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No fonts found.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function loadSystemFonts(): Promise<string[]> {
  if (systemFontsCache) {
    return Promise.resolve(systemFontsCache)
  }

  systemFontsPromise ??= Promise.resolve()
    .then(() => ListSystemFonts())
    .then((fonts) => {
      systemFontsCache = fonts
      return fonts
    })
    .catch(() => [])

  return systemFontsPromise
}
