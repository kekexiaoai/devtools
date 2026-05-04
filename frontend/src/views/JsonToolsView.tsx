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
  encodeBase64Text,
  encodeUrlText,
} from '@/lib/text-tools'

type TextToolAction =
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'

export function JsonToolsView({ isDarkMode }: { isDarkMode: boolean }) {
  const [input, setInput] = useState('')
  const [outputObject, setOutputObject] = useState({})
  const [isInputVisible, setIsInputVisible] = useState(true)
  const [validation, setValidation] = useState<{
    isValid: boolean | null
    message: string
  }>({ isValid: null, message: '' })

  const [textInput, setTextInput] = useState('')
  const [textOutput, setTextOutput] = useState('')
  const [textStatus, setTextStatus] = useState<{
    isValid: boolean | null
    message: string
  }>({ isValid: null, message: '' })

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

  const runTextTool = (action: TextToolAction) => {
    try {
      const nextOutput = transformText(action, textInput)
      setTextOutput(nextOutput)
      setTextStatus({ isValid: true, message: getTextToolLabel(action) })
    } catch (error) {
      setTextOutput('')
      setTextStatus({
        isValid: false,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const copyTextOutput = async () => {
    try {
      await navigator.clipboard.writeText(textOutput)
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
    setTextInput('')
    setTextOutput('')
    setTextStatus({ isValid: null, message: '' })
  }

  return (
    <Tabs defaultValue="json" className="h-full bg-background p-2">
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
        <div className="flex h-full flex-col space-y-4">
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2">
            <Button onClick={() => runTextTool('base64-encode')}>
              <LockKeyhole className="mr-2 h-4 w-4" /> Base64 Encode
            </Button>
            <Button
              onClick={() => runTextTool('base64-decode')}
              variant="outline"
            >
              <LockKeyhole className="mr-2 h-4 w-4" /> Base64 Decode
            </Button>
            <Button onClick={() => runTextTool('url-encode')} variant="outline">
              <Link className="mr-2 h-4 w-4" /> URL Encode
            </Button>
            <Button onClick={() => runTextTool('url-decode')} variant="outline">
              <Link className="mr-2 h-4 w-4" /> URL Decode
            </Button>
            <div className="flex-grow" />
            <Button
              onClick={() => void copyTextOutput()}
              variant="secondary"
              disabled={!textOutput}
            >
              <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Output
            </Button>
            <Button onClick={clearTextTools} variant="destructive">
              <Eraser className="mr-2 h-4 w-4" /> Clear
            </Button>
          </div>

          {textStatus.isValid !== null && (
            <StatusMessage
              isValid={textStatus.isValid}
              message={textStatus.message}
            />
          )}

          <div className="flex-grow grid grid-cols-1 gap-3 overflow-hidden min-h-0 lg:grid-cols-2">
            <ToolTextPanel
              label="Input"
              value={textInput}
              onChange={setTextInput}
              placeholder="Paste text, Base64, or URL encoded content here..."
            />
            <ToolTextPanel
              label="Output"
              value={textOutput}
              onChange={setTextOutput}
              placeholder="Converted text will be shown here..."
              readOnly
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}

function StatusMessage({
  isValid,
  message,
}: {
  isValid: boolean
  message: string
}) {
  return (
    <div
      className={`flex-shrink-0 p-2 rounded-md text-sm font-medium ${
        isValid
          ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
          : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
      }`}
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

function transformText(action: TextToolAction, value: string): string {
  switch (action) {
    case 'base64-encode':
      return encodeBase64Text(value)
    case 'base64-decode':
      return decodeBase64Text(value)
    case 'url-encode':
      return encodeUrlText(value)
    case 'url-decode':
      return decodeUrlText(value)
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
  }
}
