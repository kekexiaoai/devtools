import { SetStateAction, useCallback, useMemo, useState } from 'react'

// --- 导入 shadcn/ui 和图标 ---
import { Button } from '@/components/ui/button'
import { ClipboardIcon, TrashIcon, ChevronLeftIcon,ArrowDownTrayIcon,  } from 'lucide-react'

// --- 导入编辑器和JSON视图 ---
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactJson from 'react-json-view'

// --- 导入 Wails 原生对话框 ---
import { ShowErrorDialog, ShowInfoDialog } from '../../wailsjs/go/main/App'

// React 组件就是一个函数
export function JsonToolsView() {
  // --- 教学：使用 useState Hook 管理状态 ---
  // 每个 useState 都管理着组件中的一小块独立数据
  const [input, setInput] = useState('') // 左侧输入框的文本内容
  const [outputObject, setOutputObject] = useState({}) // 右侧输出的JS对象
  const [isInputVisible, setIsInputVisible] = useState(true) // 左侧面板是否可见
  const [validation, setValidation] = useState({ isValid: false, message: '' }) // 校验结果

  // --- 教学：使用 useMemo Hook 进行性能优化 ---
  // useMemo 会缓存一个计算结果。只有当它的依赖项(这里是 isDarkMode)改变时，
  // 它才会重新计算，避免了在每次组件渲染时都去检测暗黑模式。
  const isDarkMode = useMemo(
    () =>
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    []
  )

  const codemirrorExtensions = useMemo(() => {
    const exts = [json(), CodeMirror.lineWrapping] // 开启JSON语言和自动换行
    if (isDarkMode) {
      exts.push(oneDark)
    }
    return exts
  }, [isDarkMode])

  // --- 教学：使用 useCallback Hook 进行性能优化 ---
  // useCallback 会缓存一个函数定义。这可以防止在子组件中因为函数
  // 的引用地址在每次渲染时都改变而导致不必要的重渲染。
  const handleInputChange = useCallback((value: SetStateAction<string>) => {
    setInput(value)
  }, [])

  const toggleInputView = () => {
    setIsInputVisible(!isInputVisible)
  }

  const formatAndValidate = () => {
    if (!input.trim()) {
      setValidation({ isValid: false, message: '' })
      setOutputObject({})
      return
    }
    try {
      const jsonObj = JSON.parse(input)
      setOutputObject(jsonObj)
      setValidation({ isValid: true, message: 'Valid JSON' })
    } catch (error) {
      setOutputObject({})
      setValidation({
        isValid: false,
        message: `Invalid JSON: ${error.message}`,
      })
    }
  }

  const minifyAndCopy = async () => {
    try {
      const jsonObj = JSON.parse(input)
      await navigator.clipboard.writeText(JSON.stringify(jsonObj))
      await ShowInfoDialog('Success', 'Minified JSON copied to clipboard!')
    } catch (error) {
      await ShowErrorDialog('Error', 'Invalid JSON, cannot minify.')
    }
  }

  const copyOutput = async () => {
    try {
      const formattedText = JSON.stringify(outputObject, null, 2)
      await navigator.clipboard.writeText(formattedText)
      await ShowInfoDialog('Success', 'Formatted JSON copied to clipboard!')
    } catch (err) {
      await ShowErrorDialog('Error', `Failed to copy: ${err}`)
    }
  }

  const clearAll = () => {
    setInput('')
    setOutputObject({})
    setValidation({ isValid: null, message: '' })
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4 bg-background">
      {/* 顶部操作按钮栏 */}
      <div className="flex-shrink-0 flex items-center space-x-2">
        <Button onClick={formatAndValidate}>
          <ArrowsRightLeftIcon className="mr-2 h-4 w-4" /> Format / Validate
        </Button>
        <Button onClick={minifyAndCopy} variant="outline">
          <ArrowDownTrayIcon className="mr-2 h-4 w-4" /> Minify & Copy
        </Button>
        <div className="flex-grow" />
        <Button
          onClick={copyOutput}
          variant="secondary"
          disabled={Object.keys(outputObject).length === 0}
        >
          <ClipboardIcon className="mr-2 h-4 w-4" /> Copy Output
        </Button>
        <Button onClick={clearAll} variant="destructive">
          <TrashIcon className="mr-2 h-4 w-4" /> Clear All
        </Button>
      </div>

      {/* 校验结果反馈区 */}
      {validation.isValid !== null && (
        <div
          className={`flex-shrink-0 p-2 rounded-md text-sm font-medium ${
            validation.isValid
              ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
          }`}
        >
          {validation.message}
        </div>
      )}

      {/* 输入/输出面板 */}
      <div className="flex-grow flex items-stretch space-x-2 overflow-hidden">
        {/* 输入区 (可收起) */}
        {isInputVisible && (
          <div className="w-1/2 h-full flex flex-col transition-all duration-300">
            <label className="mb-1 text-sm font-semibold text-foreground">
              Input
            </label>
            <div className="flex-grow w-full border rounded-md overflow-hidden">
              <CodeMirror
                value={input}
                height="100%"
                extensions={codemirrorExtensions}
                onChange={handleInputChange}
                basicSetup={{
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                }}
              />
            </div>
          </div>
        )}

        {/* 分隔和切换按钮 */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <Button
            onClick={toggleInputView}
            variant="outline"
            size="icon"
            className="h-8 w-8"
          >
            <ChevronLeftIcon
              className={`h-4 w-4 transition-transform ${!isInputVisible && 'rotate-180'}`}
            />
          </Button>
        </div>

        {/* 输出区 */}
        <div
          className={`h-full flex flex-col transition-all duration-300 ${isInputVisible ? 'w-1/2' : 'w-full'}`}
        >
          <label className="mb-1 text-sm font-semibold text-foreground">
            Output
          </label>
          <div className="w-full flex-grow p-4 bg-muted/50 rounded-md border overflow-auto">
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
  )
}
