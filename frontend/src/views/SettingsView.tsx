import React from 'react'
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
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/hooks/useSettingsStore'
import { FONT_FAMILIES, NAMED_THEMES } from '@/themes/terminalThemes'

const availableThemes = [
  { name: 'System Default', value: 'System Default' },
  ...Object.entries(NAMED_THEMES).map(([key, theme]) => ({
    name: theme.name,
    value: key,
  })),
]

export function SettingsView() {
  const settings = useSettingsStore()

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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
