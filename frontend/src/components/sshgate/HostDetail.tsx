import type { types } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { PlayCircle, Pencil, Trash2 } from 'lucide-react'

interface HostDetailProps {
  host: types.SSHHost
  onEdit: (host: types.SSHHost) => void
  onDelete: (alias: string) => void
  onConnect: (alias: string) => void
}

export function HostDetail({
  host,
  onEdit,
  onDelete,
  onConnect,
}: HostDetailProps) {
  return (
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
          </div>
        </div>
      </CardHeader>
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
        <div className="pt-4">
          <Button onClick={() => onConnect(host.alias)} className="w-full">
            <PlayCircle className="mr-2 h-5 w-5" /> Connect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
