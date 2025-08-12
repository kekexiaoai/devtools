import { useDialog } from '@/hooks/useDialog'
import {
  StartDynamicForward,
  StartLocalForward,
} from '@wailsjs/go/sshgate/Service'
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
import { appLogger } from '@/lib/logger'
import {
  SheetHeader,
  SheetTitle,
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'

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
    title: 'Local Forwarding (-L)',
    description: (
      <div className="space-y-4 text-sm p-4">
        <p>
          将 **本地计算机** 的一个端口，通过 SSH 服务器，安全地 “嫁接”
          到目标网络中的 **某台特定机器** 的端口上。
        </p>
        <h4 className="font-semibold">典型场景</h4>
        <p>
          在本地用数据库管理工具（如 DataGrip,
          Navicat）连接公司内网的数据库（例如，运行在 `10.0.1.50:3306`）。
        </p>
        <h4 className="font-semibold">使用示例</h4>
        <pre className="p-2 bg-gray-100 rounded-md text-xs dark:bg-gray-800">
          <code>
            {`// 本地端口: 8888\n// 远程主机: 10.0.1.50\n// 远程端口: 3306\n\n// 连接本地的 localhost:8888 即可访问内网数据库。`}
          </code>
        </pre>
        <h4 className="font-semibold">形象比喻</h4>
        <p>在您的电脑和远程服务之间，挖了一个 **点对点的、专用的安全地道**。</p>
      </div>
    ),
  },
  dynamic: {
    title: 'Dynamic Forwarding (-D)',
    description: (
      <div className="space-y-4 text-sm p-4">
        <p>
          在您的 **本地计算机** 上创建一个通用的 SOCKS5 代理服务。任何支持 SOCKS
          代理的应用程序（如浏览器）都可以通过这个代理将所有网络流量安全地通过
          SSH 服务器转发出去。
        </p>
        <h4 className="font-semibold">典型场景</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>**安全浏览**: 在公共 Wi-Fi 下加密所有浏览器流量。</li>
          <li>
            **访问内网**: 设置好代理后，可在浏览器中直接访问所有内网服务（如
            `http://internal-wiki.corp`），就像身处内网一样。
          </li>
        </ul>
        <h4 className="font-semibold">形象比喻</h4>
        <p>
          在您本地开一个 **“万能传送门”**（SOCKS
          代理）。您告诉浏览器：“所有出门的东西都走这个传送门”，然后它们就会被安全地传送到
          SSH 服务器那里，再从那里走向最终目的地。
        </p>
      </div>
    ),
  },
  remote: { title: 'Remote Forwarding (-R)', description: '...' },
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
      <SheetContent>
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
  const [localForwardForm, setLocalForwardForm] = useState({
    localPort: '',
    remotePort: '',
    remoteHost: 'localhost',
    password: '',
  })

  const [dynamicForwardForm, setDynamicForwardForm] = useState({
    localPort: '1080',
    password: '',
  })

  const [activeTab, setActiveTab] = useState('local')
  const [isStartingTunnel, setIsStartingTunnel] = useState(false)

  // State to control the help sheet
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null)

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
      return showDialog({
        type: 'error',
        title: 'Validation',
        message: 'All fields are required and ports must be numbers',
      })
    }

    setIsStartingTunnel(true) // 进入加载状态

    try {
      const tunnelId = await StartLocalForward(
        host.alias,
        localPortNum,
        localForwardForm.remoteHost,
        remotePortNum,
        localForwardForm.password,
        true // TODO: This should be tied to a UI checkbox for "Save Password"
      )
      toast.success('Tunnel Started', {
        description: `Forwarding 127.0.0.1:${localPortNum} -> ${localForwardForm.remoteHost}:${remotePortNum}`,
      })
      onOpenChange(false) // 关闭模态框
      logger.info(
        `Local forward tunnel started successfully!\n\nTunnel ID: ${tunnelId}\nForwarding: 127.0.0.1:${localPortNum} -> ${localForwardForm.remoteHost}:${remotePortNum}`
      )
    } catch (error) {
      logger.warn(`Failed to start local forward tunnel: ${String(error)}`)
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to start local forward tunnel: ${String(error)}`,
      })
    } finally {
      setIsStartingTunnel(false) // 结束加载状态
    }
  }
  // A small helper for input fields
  const commonInputProps: React.InputHTMLAttributes<HTMLInputElement> = {
    autoComplete: 'off',
    spellCheck: false,
  }

  const handleStartDynamicForward = async () => {
    const localPortNum = parseInt(dynamicForwardForm.localPort, 10)
    if (isNaN(localPortNum)) {
      return showDialog({
        type: 'error',
        title: 'Validation',
        message: 'Local Port must be a number.',
      })
    }

    setIsStartingTunnel(true)
    try {
      const tunnelId = await StartDynamicForward(
        host.alias,
        localPortNum,
        dynamicForwardForm.password,
        true // TODO: Add a "Save Password" checkbox
      )
      toast.success('SOCKS Proxy Started', {
        description: `SOCKS5 proxy is listening on 127.0.0.1:${localPortNum}`,
      })
      onOpenChange(false)
      logger.info(
        `Dynamic forward tunnel started successfully!\n\nTunnel ID: ${tunnelId}\nSOCKS5 Proxy on: 127.0.0.1:${localPortNum}`
      )
    } catch (error) {
      logger.warn(`Failed to start dynamic forward tunnel: ${String(error)}`)
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to start dynamic forward tunnel: ${String(error)}`,
      })
    } finally {
      setIsStartingTunnel(false)
    }
  }

  const handleStartTunnel = async (tab: string) => {
    if (tab === 'local') {
      await handleStartLocalForward()
    } else if (tab === 'dynamic') {
      await handleStartDynamicForward()
    } else {
      await showDialog({
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
                  {...commonInputProps}
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
                  {...commonInputProps}
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
                  {...commonInputProps}
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="justify-self-end">
                  Password
                </Label>
                <Input
                  {...commonInputProps}
                  id="password"
                  type="password"
                  placeholder="(Optional) Enter if no key file"
                  value={localForwardForm.password}
                  onChange={(e) =>
                    setLocalForwardForm({
                      ...localForwardForm,
                      password: e.target.value,
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
                  {...commonInputProps}
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dynamic-password" className="justify-self-end">
                  Password
                </Label>
                <Input
                  {...commonInputProps}
                  id="dynamic-password"
                  type="password"
                  placeholder="(Optional) Enter if no key file"
                  value={dynamicForwardForm.password}
                  onChange={(e) =>
                    setDynamicForwardForm({
                      ...dynamicForwardForm,
                      password: e.target.value,
                    })
                  }
                  className="col-span-3"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant={'outline'} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleStartTunnel(activeTab)}
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
