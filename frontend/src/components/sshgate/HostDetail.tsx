import type { types } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { PlayCircle, Pencil, Trash2, Network } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { TunnelDial } from './TunnelDialog'

interface HostDetailProps {
  host: types.SSHHost
  onEdit: (host: types.SSHHost) => void
  onDelete: (alias: string) => void
  onConnect: (alias: string) => void
}

interface SSHStatusEventDetail {
  alias: string
  status: 'connecting' | 'failed' | 'success'
  message: string
}

export function HostDetail({
  host,
  onEdit,
  onDelete,
  onConnect,
}: HostDetailProps) {
  const [isTunnelModalOpen, setIsTunnelModalOpen] = useState(false)
  // === 连接状态管理 ===
  const [connecting, setConnecting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  useEffect(() => {
    const onSSHStatus = (event: Event) => {
      const customEvent = event as CustomEvent<SSHStatusEventDetail>
      const { alias, status, message } = customEvent.detail
      // 只处理当前主机的状态事件
      if (alias !== host.alias) return

      switch (status) {
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

    window.addEventListener('ssh:status', onSSHStatus)
    return () => window.removeEventListener('ssh:status', onSSHStatus)
  }, [host.alias]) // 依赖主机别名，确保切换主机时重新监听
  // === 状态管理结束 ===

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="font-mono text-2xl">{host.alias}</CardTitle>
              <CardDescription>
                {host.user}@{host.hostName}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-1">
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
              <Button
                onClick={() => onConnect(host.alias)}
                variant="ghost"
                size="icon"
                title="Connect"
              >
                <PlayCircle className="h-5 w-5" />
              </Button>
              <Button
                onClick={() => setIsTunnelModalOpen(true)}
                variant="ghost"
                size="icon"
                title="Configure Tunnels"
              >
                <Network className="h-5 w-5" />
              </Button>
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
