import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { Plus, XIcon } from 'lucide-react'
import { useDialog } from '@/hooks/useDialog'
import { StartLocalSession as StartLocalTerminalSession } from '@wailsjs/go/terminal/Service'

interface TerminalViewProps {
  terminalSessions: TerminalSession[]
  onCloseTerminal: (sessionId: string) => void
  onRenameTerminal: (sessionId: string, newName: string) => void
  onOpenTerminal: (session: TerminalSession) => void // 这是 addTerminalSession
  activeTerminalId: string | null
  onActiveTerminalChange: (sessionId: string | null) => void // 这是 setActiveTerminalId
  isActive: boolean
}
export function TerminalView({
  terminalSessions,
  onCloseTerminal,
  onRenameTerminal,
  onOpenTerminal,
  activeTerminalId,
  onActiveTerminalChange,
  isActive,
}: TerminalViewProps) {
  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleStartRename = (session: TerminalSession) => {
    setEditingTabId(session.id)
    setRenameValue(session.displayName)
  }

  const handleCommitRename = (sessionId: string) => {
    if (renameValue.trim()) {
      onRenameTerminal(sessionId, renameValue.trim())
    }
    setEditingTabId(null)
  }

  const { showDialog } = useDialog()

  const handleOpenLocalTerminal = async () => {
    try {
      const sessionInfo = await StartLocalTerminalSession()
      const baseName = sessionInfo.alias
      let displayName = baseName
      let counter = 1
      while (terminalSessions.some((s) => s.displayName === displayName)) {
        counter++
        displayName = `${baseName} (${counter})`
      }
      onOpenTerminal({ ...sessionInfo, displayName })
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to start local terminal: ${String(error)}`,
      })
    }
  }

  // 如果没有活动的终端会话，我们显示一个欢迎界面，并提供“新建”按钮
  if (terminalSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="mb-4">No active terminal sessions.</p>
        <Button onClick={() => void handleOpenLocalTerminal()}>
          <Plus className="mr-2 h-4 w-4" /> New Local Terminal
        </Button>
      </div>
    )
  }

  return (
    <Tabs
      // 当 activeTerminalId 为 null 时，不设置 value，
      // 让 Tabs 组件自己处理默认状态，避免不必要的重渲染
      value={activeTerminalId ?? undefined}
      onValueChange={onActiveTerminalChange}
      className="h-full flex flex-col"
    >
      <div className="flex items-center pl-2 pr-2">
        {/* 标签列表 - 添加横向滚动和 flex-shrink: 1 */}
        <TabsList className="flex-shrink-1 overflow-x-auto m-0 mr-2">
          {terminalSessions.map((session) => (
            <TabsTrigger
              key={session.id}
              value={session.id}
              className="relative pr-8"
              onDoubleClick={() => handleStartRename(session)}
            >
              {editingTabId === session.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleCommitRename(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitRename(session.id)
                    if (e.key === 'Escape') setEditingTabId(null)
                  }}
                  className="bg-transparent outline-none ring-0"
                />
              ) : (
                session.displayName
              )}
              <span
                role="button"
                aria-label="Close Tab"
                tabIndex={0}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full flex items-center justify-center hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTerminal(session.id)
                }}
                onKeyDown={(e) => {
                  // 优化：让它也能响应空格键
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    onCloseTerminal(session.id)
                  }
                }}
              >
                <XIcon className="h-3 w-3" />
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {/* 在 Tab 列表旁边，始终显示“新建”按钮 */}
        {/* 新建按钮 - 使用 ml-auto 固定在右侧 */}
        <Button
          onClick={() => void handleOpenLocalTerminal()}
          variant="ghost"
          size="icon"
          className="ml-auto flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-grow relative ml-1 mr-1 mb-2">
        {terminalSessions.map((session) => (
          // 添加 forceMount 属性！
          // 这会强制 shadcn/ui 始终渲染所有的 Tab 内容，
          // 只是用 CSS 隐藏非激活的，而不是销毁它们。
          <TabsContent
            key={session.id}
            value={session.id}
            forceMount
            // 使用 z-index 确保只有激活的 Tab 在最上层接收事件
            className={`absolute inset-0 h-full w-full ${activeTerminalId === session.id ? 'z-10' : 'z-0'}`}
          >
            <IntegratedTerminal
              websocketUrl={session.url}
              id={session.id}
              displayName={session.displayName}
              isVisible={isActive && activeTerminalId === session.id}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

// fix(terminal): 解决选项卡式终端的焦点和事件处理问题

// 本次提交修复了一个关键的 Bug，该 Bug 导致在不同终端选项卡之间切换后，非激活状态的终端会永久失去焦点，无法再接收用户输入。

// 问题的根源是双重的：

// 1.  **事件拦截**：在 `TabsContent` 上使用 `forceMount` 属性时，所有的终端容器都会被渲染并绝对定位。在没有 `z-index` 的情况下，DOM 结构中最后的选项卡会覆盖在所有其他选项卡之上，拦截它们的鼠标事件，从而阻止了非最后一个的选项卡获得焦点。

// 2.  **焦点状态管理**：`IntegratedTerminal` 组件内部用于跟踪焦点的逻辑（`hasFocusRef` 和 `onMouseDown`/`onFocus` 处理器）在之前的修改中虽然得到了简化，但由于上层组件的事件拦截问题，导致其无法被正确触发。

// 解决方案如下：

// -   **控制堆叠顺序 (Stacking Context)**：通过动态地为 `TabsContent` 组件应用 `z-index`。激活的选项卡获得 `z-10`，非激活的则为 `z-0`。这确保了只有可见的、激活的选项卡位于最顶层，能够正确接收鼠标事件。

// -   **简化可见性切换**：随着 `z-index` 解决了事件拦截，内部 `div` 的 `className` 也被简化，现在只负责根据激活状态切换 `visibility`，不再需要 `pointer-events-none`。

// 这些改动最终确保了所有终端选项卡都具有稳定和可预测的焦点行为，无论其位置或打开的选项卡数量如何。
