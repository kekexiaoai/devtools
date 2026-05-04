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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useDialog } from '@/hooks/useDialog'
import {
  decodeBase64Text,
  decodeUrlText,
  decodeJwt,
  encodeBase64Text,
  encodeUrlText,
  convertUnixTimestamp,
  generateUuidV4,
  hashText,
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
}

const textToolConfigs: TextToolConfig[] = [
  {
    action: 'base64-encode',
    label: 'Base64 Encode',
    inputPlaceholder: 'Text to encode as Base64...',
    outputPlaceholder: 'Base64 output will be shown here...',
    requiresInput: true,
  },
  {
    action: 'base64-decode',
    label: 'Base64 Decode',
    inputPlaceholder: 'Base64 text to decode...',
    outputPlaceholder: 'Decoded text will be shown here...',
    requiresInput: true,
  },
  {
    action: 'url-encode',
    label: 'URL Encode',
    inputPlaceholder: 'Text to URL encode...',
    outputPlaceholder: 'URL encoded output will be shown here...',
    requiresInput: true,
  },
  {
    action: 'url-decode',
    label: 'URL Decode',
    inputPlaceholder: 'URL encoded text to decode...',
    outputPlaceholder: 'URL decoded output will be shown here...',
    requiresInput: true,
  },
  {
    action: 'hash-md5',
    label: 'MD5',
    inputPlaceholder: 'Text to hash with MD5...',
    outputPlaceholder: 'MD5 hash will be shown here...',
    requiresInput: true,
  },
  {
    action: 'hash-sha256',
    label: 'SHA-256',
    inputPlaceholder: 'Text to hash with SHA-256...',
    outputPlaceholder: 'SHA-256 hash will be shown here...',
    requiresInput: true,
  },
  {
    action: 'hash-sha1',
    label: 'SHA-1',
    inputPlaceholder: 'Text to hash with SHA-1...',
    outputPlaceholder: 'SHA-1 hash will be shown here...',
    requiresInput: true,
  },
  {
    action: 'hash-sha512',
    label: 'SHA-512',
    inputPlaceholder: 'Text to hash with SHA-512...',
    outputPlaceholder: 'SHA-512 hash will be shown here...',
    requiresInput: true,
  },
  {
    action: 'jwt-decode',
    label: 'JWT Decode',
    inputPlaceholder: 'JWT token to decode...',
    outputPlaceholder: 'Decoded JWT JSON will be shown here...',
    requiresInput: true,
  },
  {
    action: 'timestamp-convert',
    label: 'Timestamp',
    inputPlaceholder: 'Unix timestamp in seconds or milliseconds...',
    outputPlaceholder: 'Timestamp conversion will be shown here...',
    requiresInput: true,
  },
  {
    action: 'uuid-generate',
    label: 'UUID',
    inputPlaceholder: 'UUID count, 1-100. Leave empty for 1...',
    outputPlaceholder: 'Generated UUIDs will be shown here...',
    requiresInput: false,
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

export function JsonToolsView({
  isDarkMode,
  defaultTab = 'json',
}: {
  isDarkMode: boolean
  defaultTab?: 'json' | 'text'
}) {
  const [input, setInput] = useState('')
  const [outputObject, setOutputObject] = useState({})
  const [isInputVisible, setIsInputVisible] = useState(true)
  const [validation, setValidation] = useState<{
    isValid: boolean | null
    message: string
  }>({ isValid: null, message: '' })

  const [activeTextTool, setActiveTextTool] =
    useState<TextToolAction>('base64-encode')
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

  const currentTextTool = textToolConfigs.find(
    (config) => config.action === activeTextTool
  )
  const currentTextToolState = textToolStates[activeTextTool]

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
    if (!config) return

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
      const nextOutput = await transformText(config.action, state.input)
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
    updateTextToolState(activeTextTool, () => ({
      input: '',
      output: '',
      status: null,
    }))
  }

  return (
    <Tabs defaultValue={defaultTab} className="h-full bg-background p-2">
      <div className="flex-shrink-0">
        <TabsList>
          <TabsTrigger value="json">
            <Braces className="h-4 w-4" />
            JSON
          </TabsTrigger>
          <TabsTrigger value="text">
            <LockKeyhole className="h-4 w-4" />
            Text Tools
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="json" className="min-h-0">
        <div className="flex h-full flex-col space-y-4">
          <div className="flex-shrink-0 flex items-center gap-x-2">
            <Button onClick={formatAndValidate}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Format / Validate
            </Button>
            <Button onClick={() => void minifyAndCopy()} variant="outline">
              <Download className="mr-2 h-4 w-4" /> Minify & Copy
            </Button>
            <div className="flex-grow" />
            <Button
              onClick={() => void copyJsonOutput()}
              variant="secondary"
              disabled={Object.keys(outputObject).length === 0}
            >
              <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Output
            </Button>
            <Button onClick={clearJson} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Clear
            </Button>
          </div>

          {validation.isValid !== null && (
            <StatusMessage
              isValid={validation.isValid}
              message={validation.message}
            />
          )}

          <div className="flex-grow flex items-stretch gap-x-2 overflow-hidden min-h-0">
            {isInputVisible && (
              <ToolTextPanel
                label="Input"
                value={input}
                onChange={setInput}
                placeholder="Paste your JSON here..."
                className="w-1/2"
              />
            )}

            <div className="flex-shrink-0 flex items-center justify-center">
              <Button
                onClick={toggleInputView}
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
                Output
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
        </div>
      </TabsContent>

      <TabsContent value="text" className="min-h-0">
        {currentTextTool && (
          <Tabs
            value={activeTextTool}
            onValueChange={(value) =>
              setActiveTextTool(value as TextToolAction)
            }
            className="h-full min-h-0"
          >
            <div className="flex h-full min-h-0 flex-col space-y-4">
              <TabsList className="h-auto flex-wrap justify-start">
                {textToolConfigs.map((config) => (
                  <TabsTrigger
                    key={config.action}
                    value={config.action}
                    onClick={() => setActiveTextTool(config.action)}
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

              <div className="flex-shrink-0 flex items-center gap-2">
                <Button onClick={() => void runTextTool()}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Run
                </Button>
                <Button
                  onClick={() => void copyTextOutput()}
                  variant="secondary"
                  disabled={!currentTextToolState.output}
                >
                  <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Output
                </Button>
                <Button onClick={clearTextTools} variant="destructive">
                  <Eraser className="mr-2 h-4 w-4" /> Clear
                </Button>
              </div>

              {currentTextToolState.status && (
                <StatusMessage
                  tone={currentTextToolState.status.tone}
                  message={currentTextToolState.status.message}
                />
              )}

              <div className="flex-grow grid grid-cols-1 gap-3 overflow-hidden min-h-0 lg:grid-cols-2">
                <ToolTextPanel
                  label={`${currentTextTool.label} Input`}
                  value={currentTextToolState.input}
                  onChange={(value) =>
                    updateTextToolState(activeTextTool, (prev) => ({
                      ...prev,
                      input: value,
                    }))
                  }
                  placeholder={currentTextTool.inputPlaceholder}
                />
                <ToolTextPanel
                  label={`${currentTextTool.label} Output`}
                  value={currentTextToolState.output}
                  onChange={(value) =>
                    updateTextToolState(activeTextTool, (prev) => ({
                      ...prev,
                      output: value,
                    }))
                  }
                  placeholder={currentTextTool.outputPlaceholder}
                  readOnly
                />
              </div>
            </div>
          </Tabs>
        )}
      </TabsContent>
    </Tabs>
  )
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
      return JSON.stringify(convertUnixTimestamp(value), null, 2)
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
