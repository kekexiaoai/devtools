import type { types, sshtunnel } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  ExternalLink,
  Terminal,
  Pencil,
  Trash2,
  TrainFrontTunnel,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import React, { useState, useEffect, useMemo } from 'react'
import { TunnelDial } from './TunnelDialog'

interface HostDetailProps {
  host: types.SSHHost
  onEdit: (host: types.SSHHost) => void
  onDelete: (alias: string) => void
  onConnectExternal: (alias: string) => void
  onConnectInternal: (alias: string) => void
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  isPreview?: boolean
}

interface SSHStatusEventDetail {
  alias: string
  status: 'testing' | 'connecting' | 'failed' | 'success'
  message: string
}

import { EventsOn, EventsOff } from '@wailsjs/runtime'

export function HostDetail({
  host,
  onEdit,
  onDelete,
  onConnectExternal,
  onConnectInternal,
  activeTunnels,
  isPreview = false,
}: HostDetailProps) {
  const [isTunnelModalOpen, setIsTunnelModalOpen] = useState(false)
  // === 连接状态管理 ===
  const [connecting, setConnecting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const tunnelCount = useMemo(() => {
    if (!activeTunnels) return 0
    return activeTunnels.filter((t) => t.alias === host.alias).length
  }, [activeTunnels, host.alias])

  useEffect(() => {
    // 事件处理函数直接接收后端传递的 detail 对象
    const onSSHStatus = (detail: SSHStatusEventDetail) => {
      const { alias, status, message } = detail
      console.log('ssh:status event, onSSHStatus', detail)
      if (alias !== host.alias) return

      switch (status) {
        case 'testing':
          setConnecting(true)
          setStatusMessage(message || 'Testing...')
          break
        case 'connecting':
          setConnecting(true)
          setStatusMessage(message || 'Connecting...')
          break
        case 'failed':
          setConnecting(false)
          setStatusMessage(message || 'Connection failed')
          // 3秒后自动清除失败消息
          setTimeout(() => setStatusMessage(''), 3000)
          break
        case 'success':
          setConnecting(false)
          setStatusMessage('Connected successfully')
          setTimeout(() => setStatusMessage(''), 2000)
          break
        default:
          setStatusMessage('')
      }
    }

    // 使用 Wails EventsOn 注册事件监听
    EventsOn('ssh:status', onSSHStatus)

    // 使用 Wails EventsOff 清理事件监听
    return () => EventsOff('ssh:status')
  }, [host.alias])
  // === 状态管理结束 ===

  return (
    <>
      <Card
        className={`relative ${isPreview ? 'border-dashed border-primary' : ''}`}
      >
        <CardHeader>
          {isPreview && (
            <Badge
              variant="destructive"
              className="absolute top-2 right-4 z-10"
            >
              Preview
            </Badge>
          )}
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="font-mono text-2xl">{host.alias}</CardTitle>
              <CardDescription>
                {host.user}@{host.hostName}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                onClick={() => onConnectInternal(host.alias)}
                variant="ghost"
                size="icon"
                title="Connect in App Terminal"
              >
                <Terminal className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => onConnectExternal(host.alias)}
                variant="ghost"
                size="icon"
                title="Connect in External Terminal"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button onClick={() => onEdit(host)} variant="ghost" size="icon">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => onDelete(host.alias)}
                variant="ghost"
                size="icon"
                className="hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Button
                  onClick={() => setIsTunnelModalOpen(true)}
                  variant="ghost"
                  size="icon"
                  title="Configure Tunnels"
                >
                  <TrainFrontTunnel className="h-5 w-5" />
                </Button>
                {tunnelCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-2 h-5 w-5 p-0 flex items-center justify-center pointer-events-none"
                  >
                    {tunnelCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        {/* === 连接状态显示区域 === */}
        {statusMessage && (
          <div
            className={`p-3 mx-6 ${
              connecting
                ? 'bg-blue-50 text-blue-700'
                : statusMessage.includes('failed')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-green-50 text-green-700'
            }`}
          >
            {statusMessage}
          </div>
        )}
        {/* === 状态显示结束 === */}
        <CardContent className="text-sm space-y-4">
          <div className="space-y-1">
            <p className="text-muted-foreground">HostName</p>
            <p className="font-mono">{host.hostName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">User</p>
            <p className="font-mono">{host.user}</p>
          </div>
          {host.port && (
            <div className="space-y-1">
              <p className="text-muted-foreground">Port</p>
              <p className="font-mono">{host.port}</p>
            </div>
          )}
          {host.identityFile && (
            <div className="space-y-1">
              <p className="text-muted-foreground">IdentityFile</p>
              <p className="font-mono truncate">{host.identityFile}</p>
            </div>
          )}
          {host.lastModified && (
            <div className="space-y-1">
              <p className="text-muted-foreground">Last Modified</p>
              <p className="font-mono">
                {formatDistanceToNow(new Date(host.lastModified), {
                  addSuffix: true,
                })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {/* 渲染隧道模态框, 传递 props */}
      <TunnelDial
        host={host}
        isOpen={isTunnelModalOpen}
        onOpenChange={setIsTunnelModalOpen}
      />
    </>
  )
}
