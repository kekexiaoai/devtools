import { useState } from 'react'
import ReactJson from 'react-json-view'
import {
  ArrowRightLeft,
  Braces,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  Eraser,
  Link,
  LockKeyhole,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useDialog } from '@/hooks/useDialog'
import {
  convertTimestampInput,
  decodeBase64Text,
  decodeUrlText,
  decodeJwt,
  encodeBase64Text,
  encodeUrlText,
  generateUuidV4,
  hashText,
  type TimestampDetails,
  type TimestampInputFormat,
} from '@/lib/text-tools'

type TextToolAction =
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'
  | 'hash-md5'
  | 'hash-sha1'
  | 'hash-sha256'
  | 'hash-sha512'
  | 'jwt-decode'
  | 'timestamp-convert'
  | 'uuid-generate'

type ToolAction = 'json' | TextToolAction

type TextToolStatus = {
  tone: 'success' | 'error' | 'info'
  message: string
} | null

type TextToolState = {
  input: string
  output: string
  status: TextToolStatus
}

type TextToolConfig = {
  action: TextToolAction
  label: string
  inputPlaceholder: string
  outputPlaceholder: string
  requiresInput: boolean
  layout: 'split' | 'stacked' | 'hash' | 'uuid'
}

const textToolConfigs: TextToolConfig[] = [
  {
    action: 'base64-encode',
    label: 'Base64 Encode',
    inputPlaceholder: 'Text to encode as Base64...',
    outputPlaceholder: 'Base64 output will be shown here...',
    requiresInput: true,
    layout: 'stacked',
  },
  {
    action: 'base64-decode',
    label: 'Base64 Decode',
    inputPlaceholder: 'Base64 text to decode...',
    outputPlaceholder: 'Decoded text will be shown here...',
    requiresInput: true,
    layout: 'stacked',
  },
  {
    action: 'url-encode',
    label: 'URL Encode',
    inputPlaceholder: 'Text to URL encode...',
    outputPlaceholder: 'URL encoded output will be shown here...',
    requiresInput: true,
    layout: 'stacked',
  },
  {
    action: 'url-decode',
    label: 'URL Decode',
    inputPlaceholder: 'URL encoded text to decode...',
    outputPlaceholder: 'URL decoded output will be shown here...',
    requiresInput: true,
    layout: 'stacked',
  },
  {
    action: 'hash-md5',
    label: 'MD5',
    inputPlaceholder: 'Text to hash with MD5...',
    outputPlaceholder: 'MD5 hash will be shown here...',
    requiresInput: true,
    layout: 'hash',
  },
  {
    action: 'hash-sha256',
    label: 'SHA-256',
    inputPlaceholder: 'Text to hash with SHA-256...',
    outputPlaceholder: 'SHA-256 hash will be shown here...',
    requiresInput: true,
    layout: 'hash',
  },
  {
    action: 'hash-sha1',
    label: 'SHA-1',
    inputPlaceholder: 'Text to hash with SHA-1...',
    outputPlaceholder: 'SHA-1 hash will be shown here...',
    requiresInput: true,
    layout: 'hash',
  },
  {
    action: 'hash-sha512',
    label: 'SHA-512',
    inputPlaceholder: 'Text to hash with SHA-512...',
    outputPlaceholder: 'SHA-512 hash will be shown here...',
    requiresInput: true,
    layout: 'hash',
  },
  {
    action: 'jwt-decode',
    label: 'JWT Decode',
    inputPlaceholder: 'JWT token to decode...',
    outputPlaceholder: 'Decoded JWT JSON will be shown here...',
    requiresInput: true,
    layout: 'stacked',
  },
  {
    action: 'timestamp-convert',
    label: 'Timestamp',
    inputPlaceholder: 'Unix timestamp in seconds or milliseconds...',
    outputPlaceholder: 'Timestamp conversion will be shown here...',
    requiresInput: true,
    layout: 'split',
  },
  {
    action: 'uuid-generate',
    label: 'UUID',
    inputPlaceholder: 'UUID count, 1-100. Leave empty for 1...',
    outputPlaceholder: 'Generated UUIDs will be shown here...',
    requiresInput: false,
    layout: 'uuid',
  },
]

function createInitialTextToolStates(): Record<TextToolAction, TextToolState> {
  return Object.fromEntries(
    textToolConfigs.map((config) => [
      config.action,
      { input: '', output: '', status: null },
    ])
  ) as Record<TextToolAction, TextToolState>
}

export function JsonToolsView({ isDarkMode }: { isDarkMode: boolean }) {
  const [input, setInput] = useState('')
  const [outputObject, setOutputObject] = useState<Record<string, unknown>>({})
  const [isInputVisible, setIsInputVisible] = useState(true)
  const [validation, setValidation] = useState<{
    isValid: boolean | null
    message: string
  }>({ isValid: null, message: '' })

  const [activeTool, setActiveTool] = useState<ToolAction>('json')
  const [timestampFormat, setTimestampFormat] =
    useState<TimestampInputFormat>('unix-seconds')
  const [textToolStates, setTextToolStates] = useState<
    Record<TextToolAction, TextToolState>
  >(createInitialTextToolStates)

  const { showDialog } = useDialog()

  const toggleInputView = () => {
    setIsInputVisible(!isInputVisible)
  }

  const formatAndValidate = () => {
    if (!input.trim()) {
      setValidation({ isValid: null, message: '' })
      setOutputObject({})
      return
    }
    try {
      const jsonObj = JSON.parse(input) as Record<string, unknown>
      setOutputObject(jsonObj)
      setValidation({ isValid: true, message: 'Valid JSON' })
    } catch (error) {
      setOutputObject({})
      setValidation({
        isValid: false,
        message: `Invalid JSON: ${String(error)}`,
      })
    }
  }

  const minifyAndCopy = async () => {
    try {
      const jsonObj = JSON.parse(input) as Record<string, unknown>
      await navigator.clipboard.writeText(JSON.stringify(jsonObj))
      await showDialog({
        title: 'Success',
        message: 'Minified JSON copied to clipboard!',
        type: 'info',
      })
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: 'Invalid JSON, cannot minify. ' + String(error),
      })
    }
  }

  const copyJsonOutput = async () => {
    try {
      const formattedText = JSON.stringify(outputObject, null, 2)
      await navigator.clipboard.writeText(formattedText)
      await showDialog({
        title: 'Success',
        message: 'Formatted JSON copied to clipboard!',
        type: 'info',
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      await showDialog({
        title: 'Error',
        message: `Failed to copy: ${errorMessage}`,
        type: 'error',
      })
    }
  }

  const clearJson = () => {
    setInput('')
    setOutputObject({})
    setValidation({ isValid: null, message: '' })
  }

  const currentTextAction = activeTool === 'json' ? null : activeTool
  const currentTextTool = currentTextAction
    ? textToolConfigs.find((config) => config.action === currentTextAction)
    : undefined
  const currentTextToolState = currentTextAction
    ? textToolStates[currentTextAction]
    : undefined

  const updateTextToolState = (
    action: TextToolAction,
    updater: (state: TextToolState) => TextToolState
  ) => {
    setTextToolStates((prev) => ({
      ...prev,
      [action]: updater(prev[action]),
    }))
  }

  const runTextTool = async () => {
    const config = currentTextTool
    const state = currentTextToolState
    if (!config || !state) return

    if (config.requiresInput && !state.input.trim()) {
      updateTextToolState(config.action, (prev) => ({
        ...prev,
        output: '',
        status: {
          tone: 'info',
          message: 'Enter input before running this tool.',
        },
      }))
      return
    }

    try {
      const nextOutput =
        config.action === 'timestamp-convert'
          ? JSON.stringify(
              convertTimestampInput(state.input, timestampFormat),
              null,
              2
            )
          : await transformText(config.action, state.input)
      updateTextToolState(config.action, (prev) => ({
        ...prev,
        output: nextOutput,
        status: {
          tone: 'success',
          message: getTextToolLabel(config.action),
        },
      }))
    } catch (error) {
      updateTextToolState(config.action, (prev) => ({
        ...prev,
        output: '',
        status: {
          tone: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      }))
    }
  }

  const copyTextOutput = async () => {
    if (!currentTextToolState) return

    try {
      await navigator.clipboard.writeText(currentTextToolState.output)
      await showDialog({
        title: 'Success',
        message: 'Text output copied to clipboard!',
        type: 'info',
      })
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to copy: ${String(error)}`,
        type: 'error',
      })
    }
  }

  const clearTextTools = () => {
    if (!currentTextAction) return

    updateTextToolState(currentTextAction, () => ({
      input: '',
      output: '',
      status: null,
    }))
  }

  const handleTimestampFormatChange = (format: TimestampInputFormat) => {
    setTimestampFormat(format)
    updateTextToolState('timestamp-convert', () => ({
      input: '',
      output: '',
      status: null,
    }))
  }

  const setTimestampToNow = () => {
    const inputValue = formatTimestampNowValue(new Date(), timestampFormat)

    updateTextToolState('timestamp-convert', (prev) => ({
      ...prev,
      input: inputValue,
      output: JSON.stringify(
        convertTimestampInput(inputValue, timestampFormat),
        null,
        2
      ),
      status: {
        tone: 'success',
        message: getTextToolLabel('timestamp-convert'),
      },
    }))
  }

  return (
    <Tabs
      value={activeTool}
      onValueChange={(value) => setActiveTool(value as ToolAction)}
      className="h-full bg-background p-2"
    >
      <div className="flex h-full min-h-0 gap-3">
        <div className="flex w-48 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border pr-3">
          <TabsList className="h-auto w-full flex-col items-stretch justify-start">
            <TabsTrigger
              value="json"
              className="w-full justify-start"
              onClick={() => setActiveTool('json')}
            >
              <Braces className="h-4 w-4" />
              JSON
            </TabsTrigger>
            {textToolConfigs.map((config) => (
              <TabsTrigger
                key={config.action}
                value={config.action}
                className="w-full justify-start"
                onClick={() => setActiveTool(config.action)}
              >
                {config.action.startsWith('base64') && (
                  <LockKeyhole className="h-4 w-4" />
                )}
                {config.action.startsWith('url') && (
                  <Link className="h-4 w-4" />
                )}
                {config.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {activeTool === 'json' ? (
            <>
              <div className="flex flex-col gap-2">
                <Button onClick={formatAndValidate} className="justify-start">
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Format
                </Button>
                <Button
                  onClick={() => void minifyAndCopy()}
                  variant="outline"
                  className="justify-start"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Minify
                </Button>
                <Button
                  onClick={() => void copyJsonOutput()}
                  variant="secondary"
                  disabled={Object.keys(outputObject).length === 0}
                  className="justify-start"
                >
                  <ClipboardCopy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button
                  onClick={clearJson}
                  variant="destructive"
                  className="justify-start"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>

              {validation.isValid !== null && (
                <StatusMessage
                  isValid={validation.isValid}
                  message={validation.message}
                />
              )}
            </>
          ) : (
            currentTextToolState && (
              <>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => void runTextTool()}
                    className="justify-start"
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Run
                  </Button>
                  <Button
                    onClick={() => void copyTextOutput()}
                    variant="secondary"
                    disabled={!currentTextToolState.output}
                    className="justify-start"
                  >
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    onClick={clearTextTools}
                    variant="destructive"
                    className="justify-start"
                  >
                    <Eraser className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                </div>

                {currentTextToolState.status && (
                  <StatusMessage
                    tone={currentTextToolState.status.tone}
                    message={currentTextToolState.status.message}
                  />
                )}
              </>
            )
          )}
        </div>

        <div className="min-w-0 flex-grow overflow-hidden">
          {activeTool === 'json' ? (
            <JsonToolWorkspace
              input={input}
              isDarkMode={isDarkMode}
              isInputVisible={isInputVisible}
              onInputChange={setInput}
              onToggleInput={toggleInputView}
              outputObject={outputObject}
            />
          ) : (
            currentTextTool &&
            currentTextToolState && (
              <TextToolWorkspace
                config={currentTextTool}
                onNow={setTimestampToNow}
                state={currentTextToolState}
                timestampFormat={timestampFormat}
                onTimestampFormatChange={handleTimestampFormatChange}
                onInputChange={(value) =>
                  updateTextToolState(currentTextTool.action, (prev) => ({
                    ...prev,
                    input: value,
                  }))
                }
                onOutputChange={(value) =>
                  updateTextToolState(currentTextTool.action, (prev) => ({
                    ...prev,
                    output: value,
                  }))
                }
              />
            )
          )}
        </div>
      </div>
    </Tabs>
  )
}

function JsonToolWorkspace({
  input,
  isDarkMode,
  isInputVisible,
  onInputChange,
  onToggleInput,
  outputObject,
}: {
  input: string
  isDarkMode: boolean
  isInputVisible: boolean
  onInputChange: (value: string) => void
  onToggleInput: () => void
  outputObject: Record<string, unknown>
}) {
  return (
    <div className="flex h-full min-h-0 items-stretch gap-x-2 overflow-hidden">
      {isInputVisible && (
        <ToolTextPanel
          label="JSON Input"
          value={input}
          onChange={onInputChange}
          placeholder="Paste your JSON here..."
          className="w-1/2"
        />
      )}

      <div className="flex-shrink-0 flex items-center justify-center">
        <Button
          onClick={onToggleInput}
          variant="outline"
          size="icon"
          className="h-8 w-8"
        >
          {isInputVisible ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div
        className={`h-full flex flex-col transition-all duration-75 ${isInputVisible ? 'w-1/2' : 'w-full'}`}
      >
        <label className="mb-1 text-sm font-semibold text-foreground">
          JSON Output
        </label>
        <div className="w-full flex-grow p-2 bg-muted/50 rounded-md border border-border overflow-auto">
          {Object.keys(outputObject).length > 0 ? (
            <ReactJson
              src={outputObject}
              theme={isDarkMode ? 'ocean' : 'rjv-default'}
              iconStyle="square"
              collapsed={3}
              displayDataTypes={false}
              name={false}
            />
          ) : (
            <div className="text-muted-foreground">
              Result will be shown here...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TextToolWorkspace({
  config,
  onNow,
  onInputChange,
  onOutputChange,
  onTimestampFormatChange,
  state,
  timestampFormat,
}: {
  config: TextToolConfig
  onNow: () => void
  onInputChange: (value: string) => void
  onOutputChange: (value: string) => void
  onTimestampFormatChange: (format: TimestampInputFormat) => void
  state: TextToolState
  timestampFormat: TimestampInputFormat
}) {
  if (config.action === 'timestamp-convert') {
    return (
      <TimestampToolWorkspace
        format={timestampFormat}
        onFormatChange={onTimestampFormatChange}
        onInputChange={onInputChange}
        onNow={onNow}
        state={state}
      />
    )
  }

  if (config.layout === 'stacked') {
    return (
      <div
        data-testid="text-tool-workspace"
        data-layout="stacked"
        className="grid h-full min-h-0 grid-rows-2 gap-3 overflow-hidden"
      >
        <ToolTextPanel
          label={`${config.label} Input`}
          value={state.input}
          onChange={onInputChange}
          placeholder={config.inputPlaceholder}
        />
        <ToolTextPanel
          label={`${config.label} Output`}
          value={state.output}
          onChange={onOutputChange}
          placeholder={config.outputPlaceholder}
          readOnly
        />
      </div>
    )
  }

  if (config.layout === 'hash') {
    return (
      <div
        data-testid="text-tool-workspace"
        data-layout="hash"
        className="grid h-full min-h-0 grid-rows-[minmax(140px,0.45fr)_auto] gap-3 overflow-hidden"
      >
        <ToolTextPanel
          label={`${config.label} Input`}
          value={state.input}
          onChange={onInputChange}
          placeholder={config.inputPlaceholder}
        />
        <CompactOutputField
          label={`${config.label} Hash`}
          value={state.output}
          placeholder={config.outputPlaceholder}
        />
      </div>
    )
  }

  if (config.layout === 'uuid') {
    return (
      <div
        data-testid="text-tool-workspace"
        data-layout="uuid"
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden"
      >
        <NumberInputField
          label="UUID Count"
          max={100}
          min={1}
          onChange={onInputChange}
          placeholder="1"
          value={state.input}
        />
        <ToolTextPanel
          label="Generated UUIDs"
          value={state.output}
          onChange={onOutputChange}
          placeholder={config.outputPlaceholder}
          readOnly
        />
      </div>
    )
  }

  return (
    <div
      data-testid="text-tool-workspace"
      data-layout="split"
      className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2"
    >
      <ToolTextPanel
        label={`${config.label} Input`}
        value={state.input}
        onChange={onInputChange}
        placeholder={config.inputPlaceholder}
      />
      <ToolTextPanel
        label={`${config.label} Output`}
        value={state.output}
        onChange={onOutputChange}
        placeholder={config.outputPlaceholder}
        readOnly
      />
    </div>
  )
}

function NumberInputField({
  label,
  max,
  min,
  onChange,
  placeholder,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  const inputId = `${label.toLowerCase().replaceAll(' ', '-')}-input`

  return (
    <div className="grid max-w-xs gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-foreground"
      >
        {label}
      </label>
      <Input
        id={inputId}
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="number"
        value={value}
      />
    </div>
  )
}

function CompactOutputField({
  label,
  placeholder,
  value,
}: {
  label: string
  placeholder: string
  value: string
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div className="min-h-11 overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
        {value || (
          <span className="font-sans text-muted-foreground">{placeholder}</span>
        )}
      </div>
    </div>
  )
}

function TimestampToolWorkspace({
  format,
  onFormatChange,
  onInputChange,
  onNow,
  state,
}: {
  format: TimestampInputFormat
  onFormatChange: (format: TimestampInputFormat) => void
  onInputChange: (value: string) => void
  onNow: () => void
  state: TextToolState
}) {
  const details = parseTimestampDetails(state.output)
  const rows = getTimestampRows(details)

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(280px,0.7fr)_minmax(420px,1.3fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-foreground">
              Input Format
            </label>
            <Select
              value={format}
              onValueChange={(value) =>
                onFormatChange(value as TimestampInputFormat)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unix-seconds">Unix time seconds</SelectItem>
                <SelectItem value="unix-milliseconds">
                  Unix time milliseconds
                </SelectItem>
                <SelectItem value="iso-8601">ISO 8601</SelectItem>
                <SelectItem value="local-datetime">Local date time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={onNow}
            variant="outline"
            className="self-end justify-start"
          >
            Now
          </Button>
        </div>

        <TimestampInputField
          label="Timestamp Input"
          value={state.input}
          onChange={onInputChange}
          placeholder={getTimestampPlaceholder(format)}
        />
      </div>

      <div className="min-h-0 overflow-auto rounded-md border border-border bg-muted/30 p-3">
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <TimestampResultField
              key={row.label}
              label={row.label}
              value={row.value}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TimestampInputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="grid gap-1.5">
      <label
        htmlFor="timestamp-input"
        className="text-sm font-semibold text-foreground"
      >
        {label}
      </label>
      <Input
        id="timestamp-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
    </div>
  )
}

function TimestampResultField({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="grid gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="min-h-9 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm">
        {value || '--'}
      </div>
    </div>
  )
}

function parseTimestampDetails(value: string): TimestampDetails | null {
  if (!value) return null

  try {
    return JSON.parse(value) as TimestampDetails
  } catch {
    return null
  }
}

function getTimestampRows(details: TimestampDetails | null): Array<{
  label: string
  value: string
}> {
  return [
    ['Unix Seconds', details?.seconds],
    ['Unix Milliseconds', details?.milliseconds],
    ['Unix Microseconds', details?.microseconds],
    ['Unix Nanoseconds', details?.nanoseconds],
    ['UTC', details?.utcDateTime],
    ['ISO 8601', details?.isoUtc],
    ['RFC 2822', details?.rfc2822],
    ['SQL UTC', details?.sqlUtc],
    ['SQL Local', details?.sqlLocal],
    ['Local', details?.localDateTime],
    ['UTC Date', details?.dateUtc],
    ['Local Date', details?.dateLocal],
    ['UTC Time', details?.timeUtc],
    ['Relative', details?.relative],
    ['Day of Year UTC', details?.dayOfYearUtc],
    ['ISO Week', details?.isoWeek],
    ['Weekday UTC', details?.weekdayUtc],
    ['Leap Year', details ? (details.isLeapYear ? 'Yes' : 'No') : undefined],
    ['UTC Year', details?.yearUtc],
    ['UTC Month', details?.monthUtc],
    ['UTC Quarter', details?.quarterUtc],
    ['Timezone Offset', details?.timezoneOffset],
    ['Timezone Name', details?.timezoneName],
  ].map(([label, value]) => ({
    label: String(label),
    value: value === undefined ? '' : String(value),
  }))
}

function getTimestampPlaceholder(format: TimestampInputFormat): string {
  switch (format) {
    case 'unix-seconds':
      return '1893456000'
    case 'unix-milliseconds':
      return '1893456000000'
    case 'iso-8601':
      return '2030-01-01T00:00:00.000Z'
    case 'local-datetime':
      return '2030-01-01 08:00:00'
  }
}

function formatTimestampNowValue(
  date: Date,
  format: TimestampInputFormat
): string {
  switch (format) {
    case 'unix-seconds':
      return String(Math.floor(date.getTime() / 1000))
    case 'unix-milliseconds':
      return String(date.getTime())
    case 'iso-8601':
      return date.toISOString()
    case 'local-datetime':
      return formatLocalDateTimeInput(date)
  }
}

function formatLocalDateTimeInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function StatusMessage({
  isValid,
  tone,
  message,
}: {
  isValid?: boolean
  tone?: 'success' | 'error' | 'info'
  message: string
}) {
  const currentTone = tone ?? (isValid ? 'success' : 'error')
  const toneClassName = {
    success:
      'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
    error: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    info: 'bg-muted text-muted-foreground',
  }[currentTone]

  return (
    <div
      className={`flex-shrink-0 p-2 rounded-md text-sm font-medium ${toneClassName}`}
    >
      {message}
    </div>
  )
}

function ToolTextPanel({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  readOnly?: boolean
  className?: string
}) {
  return (
    <div className={`h-full min-h-0 flex flex-col ${className}`}>
      <label className="mb-1 text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="flex-grow w-full relative min-h-[180px]">
        <div className="absolute inset-0 border border-border rounded-md">
          <Textarea
            value={value}
            readOnly={readOnly}
            onChange={(event) => onChange(event.target.value)}
            className="h-full w-full resize-none border-0 bg-transparent p-2 font-mono text-sm focus-visible:ring-0"
            placeholder={placeholder}
          />
        </div>
      </div>
    </div>
  )
}

async function transformText(
  action: TextToolAction,
  value: string
): Promise<string> {
  switch (action) {
    case 'base64-encode':
      return encodeBase64Text(value)
    case 'base64-decode':
      return decodeBase64Text(value)
    case 'url-encode':
      return encodeUrlText(value)
    case 'url-decode':
      return decodeUrlText(value)
    case 'hash-md5':
      return hashText(value, 'MD5')
    case 'hash-sha1':
      return hashText(value, 'SHA-1')
    case 'hash-sha256':
      return hashText(value, 'SHA-256')
    case 'hash-sha512':
      return hashText(value, 'SHA-512')
    case 'jwt-decode':
      return JSON.stringify(decodeJwt(value), null, 2)
    case 'timestamp-convert':
      return JSON.stringify(
        convertTimestampInput(value, 'unix-seconds'),
        null,
        2
      )
    case 'uuid-generate': {
      const count = Number(value.trim() || '1')
      return generateUuidV4(Number.isFinite(count) ? count : 1).join('\n')
    }
  }
}

function getTextToolLabel(action: TextToolAction): string {
  switch (action) {
    case 'base64-encode':
      return 'Base64 encoded.'
    case 'base64-decode':
      return 'Base64 decoded.'
    case 'url-encode':
      return 'URL encoded.'
    case 'url-decode':
      return 'URL decoded.'
    case 'hash-md5':
      return 'MD5 hash generated.'
    case 'hash-sha1':
      return 'SHA-1 hash generated.'
    case 'hash-sha256':
      return 'SHA-256 hash generated.'
    case 'hash-sha512':
      return 'SHA-512 hash generated.'
    case 'jwt-decode':
      return 'JWT decoded.'
    case 'timestamp-convert':
      return 'Timestamp converted.'
    case 'uuid-generate':
      return 'UUID generated.'
  }
}
