import React, { useMemo } from 'react' // prettier-ignore
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider' // prettier-ignore
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useSettingsStore, type ShortcutAction } from '@/hooks/useSettingsStore'
import { FONT_FAMILIES, NAMED_THEMES } from '@/themes/terminalThemes'
import { ShortcutInput } from '@/components/ShortcutInput'

const availableThemes = [
  { name: 'System Default', value: 'System Default' },
  ...Object.entries(NAMED_THEMES).map(([key, theme]) => ({
    name: theme.name,
    value: key,
  })),
]

const shortcutActions: { id: ShortcutAction; name: string }[] = [
  { id: 'newTerminal', name: 'New Local Terminal' },
  { id: 'closeTab', name: 'Close Tab' },
  { id: 'nextTab', name: 'Next Tab' },
  { id: 'prevTab', name: 'Previous Tab' },
]

export function SettingsView({ platform }: { platform: string }) {
  const settings = useSettingsStore()

  const isMac = useMemo(() => {
    return platform === 'darwin'
  }, [platform])

  return (
    <div className="p-4 h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage application-wide preferences.
        </p>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Appearance and theme settings for the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="app-theme">Application Theme</Label>
              <Select value={settings.theme} onValueChange={settings.setTheme}>
                <SelectTrigger id="app-theme" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sidebar-collapsed">
                Collapse Sidebar by Default
              </Label>
              <Switch
                id="sidebar-collapsed"
                checked={settings.sidebarCollapsed}
                onCheckedChange={settings.setSidebarCollapsed}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label
                htmlFor="tunnel-minimap-view"
                className="flex flex-col items-start gap-1.5"
              >
                <span>Tunnel Mini-map View</span>
                <span className="font-normal text-muted-foreground text-xs">
                  Use a two-panel view with a collapsible navigation map for
                  tunnels.
                </span>
              </Label>
              <Switch
                id="tunnel-minimap-view"
                checked={settings.useTunnelMiniMap}
                onCheckedChange={settings.setUseTunnelMiniMap}
              />
            </div>
          </CardContent>
        </Card>

        {/* Terminal Settings */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Terminal</CardTitle>
                <CardDescription>
                  Default settings for all new terminal sessions.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={settings.resetTerminalSettings}
              >
                Reset to Defaults
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Font Size */}
            <div className="flex items-center justify-between">
              <Label htmlFor="term-font-size">Font Size</Label>
              <div className="flex items-center gap-2 w-[240px]">
                <Slider
                  id="term-font-size"
                  min={8}
                  max={24}
                  step={1}
                  value={[settings.terminalFontSize]}
                  onValueChange={(v) => settings.setTerminalFontSize(v[0])}
                  className="flex-1"
                />
                <span className="w-8 text-right text-sm text-muted-foreground">
                  {settings.terminalFontSize}
                </span>
              </div>
            </div>
            {/* Font Family */}
            <div className="flex items-center justify-between">
              <Label htmlFor="term-font-family">Font Family</Label>
              <Select
                value={settings.terminalFontFamily}
                onValueChange={settings.setTerminalFontFamily}
              >
                <SelectTrigger id="term-font-family" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FONT_FAMILIES).map(([key, { name }]) => (
                    <SelectItem key={key} value={key}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Theme */}
            <div className="flex items-center justify-between">
              <Label htmlFor="term-theme">Theme</Label>
              <Select
                value={settings.terminalThemeName}
                onValueChange={settings.setTerminalThemeName}
              >
                <SelectTrigger id="term-theme" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableThemes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Cursor Style */}
            <div className="flex items-center justify-between">
              <Label htmlFor="term-cursor-style">Cursor Style</Label>
              <Select
                value={settings.terminalCursorStyle}
                onValueChange={settings.setTerminalCursorStyle}
              >
                <SelectTrigger id="term-cursor-style" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="underline">Underline</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Cursor Blink */}
            <div className="flex items-center justify-between">
              <Label htmlFor="term-cursor-blink">Cursor Blink</Label>
              <Switch
                id="term-cursor-blink"
                checked={settings.terminalCursorBlink}
                onCheckedChange={settings.setTerminalCursorBlink}
              />
            </div>
            {/* Copy on Select */}
            <div className="flex items-center justify-between">
              <Label htmlFor="term-copy-on-select">Copy on Select</Label>
              <Switch
                id="term-copy-on-select"
                checked={settings.terminalCopyOnSelect}
                onCheckedChange={settings.setTerminalCopyOnSelect}
              />
            </div>
            {/* Confirm on Close */}
            <div className="flex items-center justify-between">
              <Label
                htmlFor="term-confirm-on-close"
                className="flex flex-col items-start gap-1.5"
              >
                <span>Confirm on Close</span>
                <span className="font-normal text-muted-foreground text-xs">
                  Ask before closing a tab with Ctrl/Cmd+W.
                </span>
              </Label>
              <Switch
                id="term-confirm-on-close"
                checked={settings.confirmOnCloseTerminal}
                onCheckedChange={settings.setConfirmOnCloseTerminal}
              />
            </div>
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Keyboard Shortcuts</CardTitle>
                <CardDescription>
                  Customize global shortcuts for terminal operations.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={settings.resetShortcuts}
              >
                Reset to Defaults
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {shortcutActions.map((action) => {
              return (
                <div
                  key={action.id}
                  className="flex items-center justify-between"
                >
                  <Label>{action.name}</Label>
                  <div className="w-[240px]">
                    <ShortcutInput
                      value={settings.shortcuts[action.id]}
                      onChange={(newShortcut) =>
                        settings.setShortcut(action.id, newShortcut)
                      }
                      isMac={isMac}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
