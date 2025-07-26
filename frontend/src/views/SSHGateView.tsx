import { useEffect, useState } from 'react'
import { types } from '@wailsjs/go/models'
import { useDialog } from '@/hooks/useDialog'
import {
  GetSSHHosts,
  ConnectInTerminal,
  DeleteSSHHost,
} from '@wailsjs/go/backend/App'
import { PlayCircle, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HostFormDialog } from '@/components/sshgate/HostFormDialog'

export function SSHGateView() {
  const [hosts, setHosts] = useState<types.SSHHost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showDialog } = useDialog()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<types.SSHHost | null>(null)

  const fetchHosts = async () => {
    setIsLoading(true)
    try {
      const result = await GetSSHHosts()
      setHosts(result)
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to load SSH hosts: ${String(error)}`,
      })
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => {
    void fetchHosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnect = async (hostAlias: string) => {
    try {
      await ConnectInTerminal(hostAlias)
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to connect: ${String(error)}`,
      })
    }
  }
  const handleOpenNew = () => {
    setEditingHost(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (host: types.SSHHost) => {
    setEditingHost(host)
    setIsFormOpen(true)
  }

  const handleDelete = async (alias: string) => {
    const choice = await showDialog({
      type: 'confirm',
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete the host "${alias}"?`,
      buttons: [
        { text: 'Cancel', variant: 'outline', value: 'cancel' },
        { text: 'Yes, Delete', variant: 'destructive', value: 'yes' },
      ],
    })
    if (choice !== 'yes') return

    try {
      await DeleteSSHHost(alias)
      await fetchHosts()
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to delete host: ${String(error)}`,
      })
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* 标题区域：flex-shrink-0 确保它不会被压缩 */}
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-bold mb-2">SSH Gate</h1>
        <p className="text-muted-foreground mb-4">
          Manage hosts from `~/.ssh/config`
        </p>
      </div>
      <Button onClick={handleOpenNew}>+ Add Host</Button>

      {isLoading ? (
        <p>Loading SSH hosts...</p>
      ) : (
        // 列表区域：flex-1 让它占据所有剩余空间，overflow-y-auto 使其可滚动
        <div className="flex-1 overflow-y-auto pr-2">
          {hosts?.length === 0 ? (
            <p>No SSH hosts found.</p>
          ) : (
            <ul className="space-y-2">
              {hosts.map((host) => (
                <Card key={host.alias} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="font-mono flex items-center justify-between">
                      {host.alias}
                      <Button
                        onClick={() => handleOpenEdit(host)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => void handleDelete(host.alias)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => void handleConnect(host.alias)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <PlayCircle className="h-5 w-5" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1 flex-grow">
                    <p>
                      <span className="font-semibold text-foreground">
                        Host:
                      </span>{' '}
                      {host.hostName}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        User:
                      </span>{' '}
                      {host.user}
                    </p>
                    {host.port && (
                      <p>
                        <span className="font-semibold text-foreground">
                          Port:
                        </span>{' '}
                        {host.port}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </ul>
          )}
        </div>
      )}
      <HostFormDialog
        host={editingHost}
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={() => void fetchHosts()}
      />
    </div>
  )
}
