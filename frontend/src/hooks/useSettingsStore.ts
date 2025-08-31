import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { FONT_FAMILIES, NAMED_THEMES } from '@/themes/terminalThemes'

type ThemeName = 'System Default' | keyof typeof NAMED_THEMES

interface SettingsState {
  // General
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean

  // Terminal
  terminalThemeName: ThemeName
  terminalFontSize: number
  terminalFontFamily: keyof typeof FONT_FAMILIES
  terminalCopyOnSelect: boolean
  terminalScrollback: number
  terminalCursorStyle: 'block' | 'underline' | 'bar'
  terminalCursorBlink: boolean
  confirmOnCloseTerminal: boolean

  // SSH
  sshConfigPath: string

  // Tunnel
  useTunnelMiniMap: boolean
}

type TerminalSettings = Pick<
  SettingsState,
  | 'terminalThemeName'
  | 'terminalFontSize'
  | 'terminalFontFamily'
  | 'terminalCopyOnSelect'
  | 'terminalScrollback'
  | 'terminalCursorStyle'
  | 'terminalCursorBlink'
  | 'confirmOnCloseTerminal'
>

interface SettingsActions {
  setTheme: (theme: SettingsState['theme']) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setTerminalThemeName: (themeName: ThemeName) => void
  setTerminalFontSize: (size: number) => void
  setTerminalFontFamily: (font: keyof typeof FONT_FAMILIES) => void
  setTerminalCopyOnSelect: (enabled: boolean) => void
  setTerminalScrollback: (lines: number) => void
  setTerminalCursorStyle: (style: SettingsState['terminalCursorStyle']) => void
  setTerminalCursorBlink: (enabled: boolean) => void
  setConfirmOnCloseTerminal: (enabled: boolean) => void
  setSshConfigPath: (path: string) => void
  resetTerminalSettings: () => void
  setUseTunnelMiniMap: (enabled: boolean) => void
}

const defaultTerminalSettings: TerminalSettings = {
  terminalThemeName: 'System Default',
  terminalFontSize: 12,
  terminalFontFamily: 'default',
  terminalCopyOnSelect: true,
  terminalScrollback: 1000,
  terminalCursorStyle: 'block',
  terminalCursorBlink: true,
  confirmOnCloseTerminal: true,
}

const defaultSettings: Omit<SettingsState, 'theme'> = {
  sidebarCollapsed: false,
  ...defaultTerminalSettings,
  sshConfigPath: '~/.ssh/config',
  useTunnelMiniMap: true,
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      theme: 'system',
      ...defaultSettings,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setTerminalThemeName: (terminalThemeName) => set({ terminalThemeName }),
      setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize }),
      setTerminalFontFamily: (terminalFontFamily) =>
        set({ terminalFontFamily }),
      setTerminalCopyOnSelect: (terminalCopyOnSelect) =>
        set({ terminalCopyOnSelect }),
      setTerminalScrollback: (terminalScrollback) =>
        set({ terminalScrollback }),
      setTerminalCursorStyle: (terminalCursorStyle) =>
        set({ terminalCursorStyle }),
      setTerminalCursorBlink: (terminalCursorBlink) =>
        set({ terminalCursorBlink }),
      setConfirmOnCloseTerminal: (confirmOnCloseTerminal) =>
        set({ confirmOnCloseTerminal }),
      setSshConfigPath: (sshConfigPath) => set({ sshConfigPath }),
      resetTerminalSettings: () => set(defaultTerminalSettings),
      useTunnelMiniMap: true,
      setUseTunnelMiniMap: (enabled) => set({ useTunnelMiniMap: enabled }),
    }),
    {
      name: 'devtools-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
