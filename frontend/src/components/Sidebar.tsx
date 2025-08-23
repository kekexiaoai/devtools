import {
  ArrowRightLeft,
  Braces,
  Server,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import React from 'react'
import { useSettingsStore } from '@/hooks/useSettingsStore'

interface SidebarProps {
  activeTool: string
  onToolChange: (toolId: string) => void
}

const tools = [
  { id: 'SshGate', icon: Server, label: 'SSH Gate' },
  { id: 'Terminal', icon: TerminalSquare, label: 'Terminal' },
  { id: 'FileSyncer', icon: ArrowRightLeft, label: 'File Syncer' },
  { id: 'JsonTools', icon: Braces, label: 'JSON Tools' },
]

function NavButton({
  isActive,
  onClick,
  children,
  label,
  isCollapsed,
}: {
  isActive: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
  isCollapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-10 w-full items-center rounded-md text-sm font-medium transition-colors ${
        isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'
      } ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
      {!isCollapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

export function Sidebar({ activeTool, onToolChange }: SidebarProps) {
  const { sidebarCollapsed, setSidebarCollapsed } = useSettingsStore()

  return (
    <aside
      className={`flex-shrink-0 border-r border-border bg-background p-2 transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      }`}
    >
      <nav className="flex h-full flex-col items-center gap-2">
        {tools.map((tool) => (
          <NavButton
            key={tool.id}
            isActive={activeTool === tool.id}
            onClick={() => onToolChange(tool.id)}
            label={tool.label}
            isCollapsed={sidebarCollapsed}
          >
            <tool.icon className="h-5 w-5 shrink-0" />
          </NavButton>
        ))}
        <div className="mt-auto flex w-full flex-col gap-2">
          <NavButton
            isActive={activeTool === 'Settings'}
            onClick={() => onToolChange('Settings')}
            label="Settings"
            isCollapsed={sidebarCollapsed}
          >
            <Settings className="h-5 w-5 shrink-0" />
          </NavButton>
          <NavButton
            isActive={false}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            label={sidebarCollapsed ? 'Expand' : 'Collapse'}
            isCollapsed={sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <ChevronsRight className="h-5 w-5 shrink-0" />
            ) : (
              <ChevronsLeft className="h-5 w-5 shrink-0" />
            )}
          </NavButton>
        </div>
      </nav>
    </aside>
  )
}
