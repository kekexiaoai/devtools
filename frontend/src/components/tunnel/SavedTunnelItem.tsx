import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Play,
  Trash2,
  Pencil,
  Globe,
  Loader2,
  Copy,
  StopCircle,
  Code,
  Terminal,
  AlertTriangle,
  ChevronsUpDown,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TunnelStatusIndicator } from './TunnelStatusIndicator'
import { appLogger } from '@/lib/logger'
import { sshtunnel } from '@wailsjs/go/models'
import { formatTunnelDescription } from '@/lib/tunnel-utils'

interface SavedTunnelItemProps {
  tunnel: sshtunnel.SavedTunnelConfig
  activeTunnel?: sshtunnel.ActiveTunnelInfo
  onStart: (id: string) => void
  onStop: (id: string) => void
  onDelete: () => void
  onEdit: (tunnel: sshtunnel.SavedTunnelConfig) => void
  onDuplicate: () => void
  onOpenInTerminal: () => void
  lastError?: Error
  isStarting: boolean
  isSelected: boolean
}

const generateSshCommand = (tunnel: sshtunnel.SavedTunnelConfig): string => {
  const commonOptions =
    '-o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3'
  const bindAddr = tunnel.gatewayPorts ? '0.0.0.0' : '127.0.0.1'

  let forwardPart = ''
  if (tunnel.tunnelType === 'local') {
    forwardPart = `-L ${bindAddr}:${tunnel.localPort}:${tunnel.remoteHost}:${tunnel.remotePort}`
  } else if (tunnel.tunnelType === 'dynamic') {
    forwardPart = `-D ${bindAddr}:${tunnel.localPort}`
  }

  let connectionPart = ''
  if (tunnel.hostSource === 'ssh_config' && tunnel.hostAlias) {
    connectionPart = tunnel.hostAlias
  } else if (tunnel.hostSource === 'manual' && tunnel.manualHost) {
    const { user, hostName, port } = tunnel.manualHost
    connectionPart = `${user}@${hostName} -p ${port || 22}`
  }

  if (!forwardPart || !connectionPart) {
    return 'Could not generate command: invalid tunnel configuration.'
  }

  return `ssh -N ${forwardPart} ${commonOptions} ${connectionPart}`
}

function CommandDisplay({ tunnel }: { tunnel: sshtunnel.SavedTunnelConfig }) {
  const logger = useMemo(
    () => appLogger.withPrefix('tunnel').withPrefix('CommandDisplay'),
    []
  )
  const command = generateSshCommand(tunnel)

  const handleCopy = () => {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        toast.success('Command copied to clipboard!', {
          duration: 1500,
        })
      })
      .catch((err) => {
        toast.error('Failed to copy command.', {
          duration: 1500,
        })
        logger.error('Failed to copy:', err)
      })
  }

  return (
    <Collapsible className="w-full">
      <CollapsibleTrigger asChild>
        <Button
          variant="link"
          className="p-0 h-auto text-xs text-muted-foreground"
        >
          <Code className="mr-1 h-3 w-3" />
          Show equivalent command
          <ChevronsUpDown className="ml-1 h-3 w-3" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-2 bg-muted rounded-md flex items-center justify-between gap-2">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all py-1">
            <code>{command}</code>
          </pre>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            title="Copy command"
            className="h-7 w-7 shrink-0"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Helper to format host information
const formatHostInfo = (tunnel: sshtunnel.SavedTunnelConfig): string => {
  if (tunnel.hostSource === 'ssh_config' && tunnel.hostAlias) {
    return `via ${tunnel.hostAlias}`
  }
  if (tunnel.hostSource === 'manual' && tunnel.manualHost) {
    return `via ${tunnel.manualHost.user}@${tunnel.manualHost.hostName}`
  }
  return 'via Unknown Host'
}

export function SavedTunnelItem({
  tunnel,
  activeTunnel,
  onStart,
  onStop,
  onDelete,
  onEdit,
  onDuplicate,
  onOpenInTerminal,
  lastError,
  isStarting,
  isSelected,
}: SavedTunnelItemProps) {
  const status = activeTunnel?.status
  const isRunning = status === 'active'
  const isStopping = status === 'stopping'
  const isDisconnected = status === 'disconnected'
  const isBusy = isStarting || isStopping
  const hasLastError = !!lastError && !isRunning && !isStarting
  const canOpenInTerminal =
    tunnel.hostSource === 'ssh_config' && !!tunnel.hostAlias

  const cardStateStyles = useMemo(() => {
    if (isRunning) {
      return 'border-l-green-500'
    }
    if (isDisconnected) {
      return 'border-l-red-500'
    }
    if (isBusy) {
      return 'border-l-yellow-500'
    }
    return 'border-l-transparent'
  }, [isRunning, isDisconnected, isBusy])

  return (
    <Card
      className={cn(
        'gap-3 py-3 transition-colors hover:bg-muted border-l-4',
        cardStateStyles, // Apply the selected style
        isSelected && 'bg-muted'
      )}
    >
      <CardHeader className="px-4 pt-0">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{tunnel.name}</CardTitle>
            <CardDescription className="pt-1.5">
              {formatHostInfo(tunnel)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {activeTunnel && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <TunnelStatusIndicator status={activeTunnel.status} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{activeTunnel.statusMsg}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {tunnel.gatewayPorts && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Globe className="h-4 w-4 mr-1" />
                      <span>Public</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>GatewayPorts enabled</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <div className="space-y-2">
          {formatTunnelDescription(tunnel)}
          {hasLastError && (
            <div className="mt-2 text-xs text-destructive flex items-start gap-2 p-2 bg-destructive/10 rounded-md">
              <AlertTriangle className="h-4 w-4 mt-px shrink-0" />
              <p className="break-all leading-relaxed">{lastError.message}</p>
            </div>
          )}
          <CommandDisplay tunnel={tunnel} />
        </div>
      </CardContent>
      <CardFooter className="px-4 pb-0 flex justify-end space-x-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* The button is wrapped in a span to allow the tooltip to show even when disabled */}
              <span tabIndex={canOpenInTerminal ? undefined : 0}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenInTerminal}
                  disabled={!canOpenInTerminal || isBusy}
                >
                  <Terminal className="mr-2 h-4 w-4" /> Open Terminal
                </Button>
              </span>
            </TooltipTrigger>
            {!canOpenInTerminal && (
              <TooltipContent>
                <p>Only available for tunnels based on an SSH config alias.</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" onClick={() => onEdit(tunnel)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
        {isRunning ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onStop(activeTunnel!.id)}
            disabled={isBusy}
          >
            {isStopping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <StopCircle className="mr-2 h-4 w-4" />
            )}
            {isStopping ? 'Stopping...' : 'Stop'}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onStart(tunnel.id)}
            disabled={isBusy}
          >
            {isStarting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isStarting ? 'Starting...' : isDisconnected ? 'Restart' : 'Start'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
