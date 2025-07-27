import { useDialog } from '@/hooks/useDialog'
import { StartLocalForward } from '@wailsjs/go/backend/App'
import { types } from '@wailsjs/go/models'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TabsContent } from '@radix-ui/react-tabs'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Loader2 } from 'lucide-react'

interface TunnelDialProps {
  host: types.SSHHost
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
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

  const [isStartingTunnel, setIsStartingTunnel] = useState(false)

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
        localForwardForm.password
      )
      await showDialog({
        type: 'success',
        title: 'Success',
        message: `Local forward tunnel started successfully!\n\nTunnel ID: ${tunnelId}\nForwarding: 127.0.0.1:${localPortNum} -> ${localForwardForm.remoteHost}:${remotePortNum}`,
      })
      onOpenChange(false) // 关闭模态框
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to start local forward tunnel: ${String(error)}`,
      })
    } finally {
      setIsStartingTunnel(false) // 结束加载状态
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

        <Tabs>
          <TabsList>
            <TabsTrigger value="local">Local Forward (-L)</TabsTrigger>
            <TabsTrigger value="remote" disabled>
              Remote (-R)
            </TabsTrigger>
            <TabsTrigger value="dynamic" disabled>
              Dynamic (-D)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local">
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">
                Forwards connections from a local port to a port on the remote
                server.
              </p>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="justify-self-end">
                  Password
                </Label>
                <Input
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
          {/* 其它的tab内容稍后添加 */}
        </Tabs>
        <DialogFooter>
          <Button variant={'outline'} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleStartLocalForward()}
            disabled={isStartingTunnel}
          >
            {isStartingTunnel && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isStartingTunnel ? 'Starting...' : 'Start Tunnel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
