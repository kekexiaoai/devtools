import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { FONT_FAMILIES, NAMED_THEMES } from '@/themes/terminalThemes'

type ThemeName = 'System Default' | keyof typeof NAMED_THEMES

export interface Shortcut {
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

export type ShortcutAction = 'newTerminal' | 'closeTab' | 'nextTab' | 'prevTab'

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
  shortcuts: Record<ShortcutAction, Shortcut>

  // SSH
  sshConfigPath: string

  // Tunnel
  useTunnelMiniMap: boolean
  autoResumeSync: boolean
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
  setShortcut: (action: ShortcutAction, shortcut: Shortcut) => void
  setSshConfigPath: (path: string) => void
  resetTerminalSettings: () => void
  resetShortcuts: () => void
  setUseTunnelMiniMap: (enabled: boolean) => void
  setAutoResumeSync: (enabled: boolean) => void
  setPlatformDefaults: (platform: string) => void
}

const defaultShortcuts: Record<ShortcutAction, Shortcut> = {
  newTerminal: { key: 't', ctrl: true, meta: true, alt: false, shift: false }, // CmdOrCtrl+T
  // Default for closeTab will be set dynamically based on platform.
  // Set a safe initial default.
  closeTab: { key: 'w', ctrl: true, meta: true, alt: false, shift: true }, // CmdOrCtrl+Shift+W
  nextTab: { key: 'Tab', ctrl: true, meta: false, alt: false, shift: false }, // Ctrl+Tab
  prevTab: { key: 'Tab', ctrl: true, meta: false, alt: false, shift: true }, // Ctrl+Shift+Tab
}

const defaultTerminalSettings: TerminalSettings = {
  terminalThemeName: 'System Default',
  terminalFontSize: 12,
  terminalFontFamily: 'default',
  terminalCopyOnSelect: true,
  terminalScrollback: 1000,
  terminalCursorStyle: 'block',
  terminalCursorBlink: true,
}

const defaultSettings: Omit<SettingsState, 'theme'> = {
  sidebarCollapsed: false,
  ...defaultTerminalSettings,
  confirmOnCloseTerminal: true,
  shortcuts: defaultShortcuts,
  sshConfigPath: '~/.ssh/config',
  useTunnelMiniMap: true,
  autoResumeSync: true,
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
      setShortcut: (action, shortcut) =>
        set((state) => ({
          shortcuts: {
            ...state.shortcuts,
            [action]: shortcut,
          },
        })),
      setSshConfigPath: (sshConfigPath) => set({ sshConfigPath }),
      resetTerminalSettings: () => set(defaultTerminalSettings),
      resetShortcuts: () => set({ shortcuts: defaultShortcuts }),
      useTunnelMiniMap: true,
      setUseTunnelMiniMap: (enabled) => set({ useTunnelMiniMap: enabled }),
      setAutoResumeSync: (enabled) => set({ autoResumeSync: enabled }),
      setPlatformDefaults: (platform) =>
        set((state) => {
          // This function should only run once on startup.
          // We check if the 'closeTab' shortcut is still the initial safe default.
          // If the user has already changed it, we don't want to override their setting.
          const currentCloseTab = state.shortcuts.closeTab
          const isInitialDefault =
            currentCloseTab.key === 'w' &&
            currentCloseTab.ctrl &&
            currentCloseTab.meta &&
            currentCloseTab.shift

          if (!isInitialDefault) {
            return {} // User has already customized, do nothing.
          }

          const isMac = platform === 'darwin'
          const platformAwareCloseTab = {
            key: 'w',
            ctrl: !isMac,
            meta: isMac,
            alt: false,
            shift: !isMac,
          }

          return {
            shortcuts: {
              ...state.shortcuts,
              closeTab: platformAwareCloseTab,
            },
          }
        }),
    }),
    {
      name: 'devtools-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
