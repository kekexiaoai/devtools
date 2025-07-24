import { useEffect, useState } from 'react'
import { types } from '../../wailsjs/go/models'
import { useDialog } from '@/hooks/useDialog'
import { GetSSHHosts } from '../../wailsjs/go/backend/App'

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
                <li
                  key={host.alias}
                  className="p-4 bg-muted rounded-md flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold font-mono">{host.alias}</p>
                    <p className="text-sm text-muted-foreground">
                      {host.user}@{host.hostName}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
