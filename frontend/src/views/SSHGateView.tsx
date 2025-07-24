import { useEffect, useState } from 'react'
import { types } from '../../wailsjs/go/models'
import { useDialog } from '@/hooks/useDialog'
import { GetSSHHosts, ConnectInTerminal } from '../../wailsjs/go/backend/App'
import { PlayCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function SSHGateView() {
  const [hosts, setHosts] = useState<types.SSHHost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showDialog } = useDialog()

  useEffect(() => {
    const fetchHosts = async () => {
      try {
        const fetchedHosts = await GetSSHHosts()
        setHosts(fetchedHosts)
        setIsLoading(false)
      } catch (error) {
        await showDialog({
          title: 'Error',
          message: `Failed to load configurations: ${String(error)}`,
        })
        setHosts([])
        setIsLoading(false)
      }
    }
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
  return (
    <div className="p-4 h-full">
      <h1 className="text-2xl font-bold mb-4">SSH Gate - Config Manager</h1>
      {isLoading ? (
        <p>Loading SSH hosts from ~/.ssh/config...</p>
      ) : (
        <div>
          {hosts.length === 0 ? (
            <p>No SSH hosts found in ~/.ssh/config.</p>
          ) : (
            <ul className="space-y-2">
              {hosts.map((host) => (
                <Card key={host.alias} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="font-mono flex items-center justify-between">
                      {host.alias}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={`Connect to ${host.alias}`}
                        onClick={() => void handleConnect(host.alias)}
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
    </div>
  )
}
