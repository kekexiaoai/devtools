import { useDialog } from '@/hooks/useDialog'
import { CreateAndStartTunnel } from '@wailsjs/go/sshgate/Service'
import { toast } from 'sonner'
import { types } from '@wailsjs/go/models'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Info, Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { appLogger } from '@/lib/logger'
import {
  SheetHeader,
  SheetTitle,
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { useSshConnection } from '@/hooks/useSshConnection'

interface TunnelDialProps {
  host: types.SSHHost
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

type HelpTopic = 'local' | 'remote' | 'dynamic'

const helpContent: Record<
  HelpTopic,
  { title: string; description: React.ReactNode }
> = {
  local: {
    title: 'Local Forwarding (-L) / 本地转发',
    description: (
      <div className="space-y-4 text-sm p-4">
        <div>
          <p>
            将 **本地计算机** 的一个端口，通过 SSH 服务器，安全地 “嫁接”
            到目标网络中的 **某台特定机器** 的端口上。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Securely &quot;grafts&quot; a port on your{' '}
            <strong>local computer</strong> to a port on a{' '}
            <strong>specific machine</strong> within the target network, via the
            SSH server.
          </p>
        </div>
        <h4 className="font-semibold">典型场景 / Typical Scenario</h4>
        <div>
          <p>
            在本地用数据库管理工具（如 DataGrip,
            Navicat）连接公司内网的数据库（例如，运行在 `10.0.1.50:3306`）。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Using a database management tool (like DataGrip, Navicat) on your
            local machine to connect to a database inside the company&apos;s
            internal network (e.g., running on <code>10.0.1.50:3306</code>).
          </p>
        </div>
        <h4 className="font-semibold">使用示例 / Example Usage</h4>
        <pre className="p-2 bg-gray-100 rounded-md text-xs dark:bg-gray-800">
          <code>
            {`// 本地端口 (Local Port): 8888
// 远程主机 (Remote Host): 10.0.1.50
// 远程端口 (Remote Port): 3306

// 连接本地的 localhost:8888 即可访问内网数据库。
// Connecting to localhost:8888 on your local machine will access the internal database.`}
          </code>
        </pre>
        <h4 className="font-semibold">形象比喻 / Analogy</h4>
        <div>
          <p>
            在您的电脑和远程服务之间，挖了一个{' '}
            <strong>点对点的、专用的安全地道</strong>。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            It&apos;s like digging a{' '}
            <strong>point-to-point, dedicated, secure tunnel</strong> between
            your computer and the remote service.
          </p>
        </div>
      </div>
    ),
  },
  dynamic: {
    title: 'Dynamic Forwarding (-D) / 动态转发',
    description: (
      <div className="space-y-4 text-sm p-4">
        <div>
          <p>
            在您的 **本地计算机** 上创建一个通用的 SOCKS5 代理服务。任何支持
            SOCKS
            代理的应用程序（如浏览器）都可以通过这个代理将所有网络流量安全地通过
            SSH 服务器转发出去。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Creates a general-purpose SOCKS5 proxy service on your{' '}
            <strong>local computer</strong>. Any application that supports SOCKS
            proxy (like a web browser) can route all its network traffic
            securely through the SSH server via this proxy.
          </p>
        </div>
        <h4 className="font-semibold">典型场景 / Typical Scenarios</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <p>
              <strong>安全浏览</strong>: 在公共 Wi-Fi 下加密所有浏览器流量。
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Secure Browsing</strong>: Encrypt all browser traffic when
              on public Wi-Fi.
            </p>
          </li>
          <li>
            <p>
              <strong>访问内网</strong>:
              设置好代理后，可在浏览器中直接访问所有内网服务（如
              `http://internal-wiki.corp`），就像身处内网一样。
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Accessing Internal Networks</strong>: Once the proxy is
              set up, you can directly access all internal services (like{' '}
              <code>http://internal-wiki.corp</code>) in your browser as if you
              were on the internal network.
            </p>
          </li>
        </ul>
        <h4 className="font-semibold">形象比喻 / Analogy</h4>
        <div>
          <p>
            在您本地开一个 <strong>“万能传送门”</strong>（SOCKS
            代理）。您告诉浏览器：“所有出门的东西都走这个传送门”，然后它们就会被安全地传送到
            SSH 服务器那里，再从那里走向最终目的地。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            It&apos;s like opening a{' '}
            <strong>&quot;universal portal&quot;</strong> (the SOCKS proxy) on
            your local machine. You tell your browser, &quot;Everything going
            out should use this portal,&quot; and it gets securely transported
            to the SSH server, then proceeds to its final destination from
            there.
          </p>
        </div>
      </div>
    ),
  },
  remote: {
    title: 'Remote Forwarding (-R) / 远程转发',
    description: '...',
  },
}

function HelpSheet({
  topic,
  onOpenChange,
}: {
  topic: HelpTopic | null
  onOpenChange: (isOpen: boolean) => void
}) {
  const content = topic ? helpContent[topic] : null

  return (
    <Sheet open={!!topic} onOpenChange={onOpenChange}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>{content?.title}</SheetTitle>
        </SheetHeader>
        <div className="py-4">{content?.description}</div>
      </SheetContent>
    </Sheet>
  )
}

export function TunnelDial(props: TunnelDialProps) {
  const { host, isOpen, onOpenChange } = props

  const { showDialog } = useDialog()
  const noOpOnOpenTerminal = React.useCallback(() => {}, [])

  const { connect: verifyConnection } = useSshConnection({
    showDialog,
    onOpenTerminal: noOpOnOpenTerminal, // 在 'verify' 模式下不会被调用
  })

  const [localForwardForm, setLocalForwardForm] = useState({
    localPort: '',
    remotePort: '',
    remoteHost: 'localhost',
  })

  const [dynamicForwardForm, setDynamicForwardForm] = useState({
    localPort: '1080',
  })

  const [activeTab, setActiveTab] = useState('local')
  const [isStartingTunnel, setIsStartingTunnel] = useState(false)
  const [gatewayPorts, setGatewayPorts] = useState(false)

  // State to control the help sheet
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null)

  // Ref to track component mount status, preventing state updates on unmounted components
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const aliasRef = useRef(host.alias)
  useEffect(() => {
    aliasRef.current = host.alias
  }, [host.alias])

  const logger = useMemo(() => {
    const getDynamicPrefix = () => `[${aliasRef.current}]`
    return appLogger.withPrefix('TunnelDial').withPrefix(getDynamicPrefix)
  }, [])

  const handleStartLocalForward = async () => {
    // input validate
    const localPortNum = parseInt(localForwardForm.localPort, 10)
    const remotePortNum = parseInt(localForwardForm.remotePort, 10)
    if (
      isNaN(localPortNum) ||
      isNaN(remotePortNum) ||
      !localForwardForm.remoteHost
    ) {
      void showDialog({
        type: 'error',
        title: 'Validation',
        message: 'All fields are required and ports must be numbers',
      })
      return
    }

    try {
      // Step 1: Perform interactive verification. NO TOASTS should be shown here.
      // Do NOT set loading state here.

      const password = await verifyConnection({
        alias: host.alias,
        strategy: 'verify',
      })

      // If user cancelled, the hook shows its own toast. We just exit.
      if (password === null) {
        // No state change needed, just exit.
        return
      }

      // Step 2: Interactive part is done. Now show loading toast and start the tunnel.
      const toastId = toast.loading(`Starting tunnel for ${host.alias}...`)
      setIsStartingTunnel(true) // Set loading state NOW.

      const configId = await CreateAndStartTunnel(
        'local',
        host.alias,
        localPortNum,
        localForwardForm.remoteHost,
        remotePortNum,
        gatewayPorts,
        password
      )

      const bindAddr = gatewayPorts ? '0.0.0.0' : '127.0.0.1'
      const successMessage = `Forwarding ${bindAddr}:${localPortNum} -> ${localForwardForm.remoteHost}:${remotePortNum}`
      logger.info(
        `Local forward tunnel started successfully! Tunnel Config ID: ${configId}`
      )

      toast.success(`Tunnel Started: ${successMessage}`, { id: toastId })
      onOpenChange(false) // Close dialog on success
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      // The cancellation case is handled above, so we don't need to check for 'cancelled' here.
      toast.error(`Failed to start tunnel: ${err.message}`)
    } finally {
      // This will run for success, error, and cancellation cases.
      if (isMountedRef.current) {
        setIsStartingTunnel(false)
      }
    }
  }

  const handleStartDynamicForward = async () => {
    const localPortNum = parseInt(dynamicForwardForm.localPort, 10)
    if (isNaN(localPortNum)) {
      void showDialog({
        type: 'error',
        title: 'Validation',
        message: 'Local Port must be a number.',
      })
      return
    }

    try {
      // Step 1: Perform interactive verification.
      // Do NOT set loading state here.

      const password = await verifyConnection({
        alias: host.alias,
        strategy: 'verify',
      })

      if (password === null) {
        return // User cancelled.
      }

      // Step 2: Start the operation with a loading toast.
      const toastId = toast.loading(`Starting SOCKS proxy for ${host.alias}...`)
      setIsStartingTunnel(true) // Set loading state NOW.

      await CreateAndStartTunnel(
        'dynamic',
        host.alias,
        localPortNum,
        '', // remoteHost is not applicable for dynamic
        0, // remotePort is not applicable for dynamic
        gatewayPorts,
        password
      )

      const bindAddr = gatewayPorts ? '0.0.0.0' : '127.0.0.1'
      const successMessage = `SOCKS5 proxy is listening on ${bindAddr}:${localPortNum}`

      toast.success(`SOCKS Proxy Started: ${successMessage}`, {
        id: toastId,
        duration: 2000,
      })
      onOpenChange(false)
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      toast.error(`Failed to start proxy: ${err.message}`)
    } finally {
      if (isMountedRef.current) {
        setIsStartingTunnel(false)
      }
    }
  }

  const handleStartTunnel = (tab: string): void => {
    if (tab === 'local') {
      void handleStartLocalForward()
    } else if (tab === 'dynamic') {
      void handleStartDynamicForward()
    } else {
      void showDialog({
        type: 'error',
        title: 'Error',
        message: `Invalid tab value: ${tab}`,
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            SSH Tunnels for{' '}
            <span className="font-mono text-primary">{host.alias}</span>
          </DialogTitle>
          <DialogDescription>
            Configure port forwarding tunnels for this host.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="local">Local Forward (-L)</TabsTrigger>
            <TabsTrigger value="remote" disabled>
              Remote (-R)
            </TabsTrigger>
            <TabsTrigger value="dynamic">Dynamic (-D)</TabsTrigger>
          </TabsList>

          <TabsContent value="local">
            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  将本地端口映射到远程网络中的特定服务。
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setHelpTopic('local')}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="local-port" className="justify-self-end">
                  Local Port
                </Label>
                <Input
                  id="local-port"
                  type="number"
                  placeholder="e.g., 8080"
                  value={localForwardForm.localPort}
                  onChange={(e) =>
                    setLocalForwardForm({
                      ...localForwardForm,
                      localPort: e.target.value,
                    })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="remote-host" className="justify-self-end">
                  Remote Host
                </Label>
                <Input
                  id="remote-host"
                  placeholder="localhost or an internal IP"
                  value={localForwardForm.remoteHost}
                  onChange={(e) =>
                    setLocalForwardForm({
                      ...localForwardForm,
                      remoteHost: e.target.value,
                    })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="remote-port" className="justify-self-end">
                  Remote Port
                </Label>
                <Input
                  id="remote-port"
                  type="number"
                  placeholder="e.g., 3306"
                  value={localForwardForm.remotePort}
                  onChange={(e) =>
                    setLocalForwardForm({
                      ...localForwardForm,
                      remotePort: e.target.value,
                    })
                  }
                  className="col-span-3"
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="dynamic">
            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  在本地创建一个通用的 SOCKS5 代理。
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setHelpTopic('dynamic')}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="dynamic-local-port"
                  className="justify-self-end"
                >
                  Local Port
                </Label>
                <Input
                  id="dynamic-local-port"
                  type="number"
                  placeholder="e.g., 1080"
                  value={dynamicForwardForm.localPort}
                  onChange={(e) =>
                    setDynamicForwardForm({
                      ...dynamicForwardForm,
                      localPort: e.target.value,
                    })
                  }
                  className="col-span-3"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex items-center space-x-2 pt-2">
          <Checkbox
            id="gateway-ports"
            checked={gatewayPorts}
            onCheckedChange={(checked) => setGatewayPorts(Boolean(checked))}
          />
          <Label
            htmlFor="gateway-ports"
            className="text-sm font-normal text-muted-foreground"
          >
            Allow remote connections (GatewayPorts)
          </Label>
        </div>
        <DialogFooter>
          <Button variant={'outline'} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => handleStartTunnel(activeTab)}
            disabled={isStartingTunnel}
          >
            {isStartingTunnel && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isStartingTunnel ? 'Starting...' : 'Start Tunnel'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <HelpSheet topic={helpTopic} onOpenChange={() => setHelpTopic(null)} />
    </Dialog>
  )
}
