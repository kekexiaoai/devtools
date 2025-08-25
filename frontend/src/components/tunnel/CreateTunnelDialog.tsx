import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { sshtunnel, types } from '@wailsjs/go/models'
import { SaveTunnelConfig } from '@wailsjs/go/sshgate/Service'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

interface CreateTunnelDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSuccess: (shouldStart: boolean) => void
  hosts: types.SSHHost[]
  tunnelToEdit?: sshtunnel.SavedTunnelConfig
}

const initialFormState: Omit<sshtunnel.SavedTunnelConfig, 'id'> = {
  name: '',
  tunnelType: 'local',
  localPort: 8080,
  gatewayPorts: false,
  remoteHost: 'localhost',
  remotePort: 80,
  hostSource: 'ssh_config',
  hostAlias: '',
  manualHost: {
    hostName: '',
    port: '22',
    user: '',
    identityFile: '',
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  convertValues: (a: unknown, _class: unknown): unknown => {
    // 保持默认行为：直接返回原始值
    return a
  },
}

export function CreateTunnelDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  hosts,
  tunnelToEdit,
}: CreateTunnelDialogProps) {
  const [formData, setFormData] = useState(initialFormState)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (tunnelToEdit) {
        // Editing an existing tunnel
        setFormData({ ...initialFormState, ...tunnelToEdit })
      } else {
        // Creating a new tunnel, set defaults
        const newForm = { ...initialFormState }
        if (newForm.hostSource === 'ssh_config' && hosts.length > 0) {
          newForm.hostAlias = hosts[0].alias
        } else {
          newForm.hostAlias = ''
        }
        setFormData(newForm)
      }
    }
  }, [isOpen, tunnelToEdit, hosts])

  const handleChange = (
    field: keyof typeof formData,
    value: string | number | boolean
  ) => {
    setFormData((prev) => {
      const newState = { ...prev, [field]: value }
      // If hostSource is changed, adjust other fields
      if (field === 'hostSource') {
        if (value === 'manual') {
          newState.hostAlias = '' // Clear alias for manual host
        } else if (value === 'ssh_config') {
          // Set default alias if available
          newState.hostAlias = hosts.length > 0 ? hosts[0].alias : ''
        }
      }
      return newState
    })
  }

  const handleManualHostChange = (
    field: keyof sshtunnel.ManualHostInfo,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      // We use a type assertion here because TypeScript has trouble inferring the
      // correct type when spreading a union and using a computed property name.
      manualHost: {
        ...(prev.manualHost ?? initialFormState.manualHost),
        [field]: value,
      } as sshtunnel.ManualHostInfo,
      // TypeScript 难以完全确定最终对象的类型。
      // 它看到了一个对象扩展 (...)、一个联合类型 (prev.manualHost 可能是 ManualHostInfo | undefined) 和一个计算属性名 ([field])。
      // 在这种组合下，类型检查器有时会错误地认为，那些不是由 [field] 直接更新的必需属性（如 hostName）可能会变成 undefined，因此抛出类型不兼容的错误。
      // 为了解决这个问题，我们使用类型断言 (as sshtunnel.ManualHostInfo) 来告诉 TypeScript，我们知道这个对象的类型，并且不会出错。
    }))
  }

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error('Tunnel Name is required.')
      return false
    }
    if (formData.hostSource === 'ssh_config' && !formData.hostAlias) {
      toast.error('Host Alias must be selected for an SSH Config host.')
      return false
    }
    if (formData.hostSource === 'manual') {
      if (!formData.manualHost?.hostName.trim()) {
        toast.error('Host Name is required for a manual host.')
        return false
      }
      if (!formData.manualHost?.user.trim()) {
        toast.error('User is required for a manual host.')
        return false
      }
    }
    return true
  }

  const handleSave = async (shouldStart: boolean) => {
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const configToSave: sshtunnel.SavedTunnelConfig = {
        ...formData,
        id: tunnelToEdit?.id || '', // Empty ID means create new
      }
      await SaveTunnelConfig(configToSave)
      toast.success(
        `Tunnel "${configToSave.name}" ${tunnelToEdit ? 'updated' : 'created'}.`
      )
      onSuccess(shouldStart)
    } catch (error) {
      toast.error(`Failed to save tunnel: ${String(error)}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>
            {tunnelToEdit ? 'Edit Tunnel' : 'Create New Tunnel'}
          </DialogTitle>
          <DialogDescription>
            Configure the details for your SSH tunnel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="col-span-3"
            />
          </div>

          {/* Tunnel Type */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tunnelType" className="text-right">
              Type
            </Label>
            <Select
              value={formData.tunnelType}
              onValueChange={(v) => handleChange('tunnelType', v)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local Forward (-L)</SelectItem>
                <SelectItem value="dynamic">Dynamic (SOCKS5)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Local Port */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="localPort" className="text-right">
              Local Port
            </Label>
            <Input
              id="localPort"
              type="number"
              value={formData.localPort}
              onChange={(e) =>
                handleChange('localPort', parseInt(e.target.value, 10) || 0)
              }
              className="col-span-3"
            />
          </div>

          {/* Remote Host/Port for Local Forwarding */}
          {formData.tunnelType === 'local' && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="remoteHost" className="text-right">
                  Remote Host
                </Label>
                <Input
                  id="remoteHost"
                  value={formData.remoteHost}
                  onChange={(e) => handleChange('remoteHost', e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="remotePort" className="text-right">
                  Remote Port
                </Label>
                <Input
                  id="remotePort"
                  type="number"
                  value={formData.remotePort}
                  onChange={(e) =>
                    handleChange(
                      'remotePort',
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  className="col-span-3"
                />
              </div>
            </>
          )}

          {/* Host Source */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="hostSource" className="text-right">
              SSH Host
            </Label>
            <Select
              value={formData.hostSource}
              onValueChange={(v) => handleChange('hostSource', v)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ssh_config">From ~/.ssh/config</SelectItem>
                <SelectItem value="manual">Manual Entry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SSH Config Host Alias */}
          {formData.hostSource === 'ssh_config' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="hostAlias" className="text-right">
                Host Alias
              </Label>
              <Select
                value={formData.hostAlias}
                onValueChange={(v) => handleChange('hostAlias', v)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hosts.map((host) => (
                    <SelectItem key={host.alias} value={host.alias}>
                      {host.alias}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Manual Host Fields */}
          {formData.hostSource === 'manual' && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="manual-hostname" className="text-right">
                  Host Name
                </Label>
                <Input
                  id="manual-hostname"
                  value={formData.manualHost?.hostName || ''}
                  onChange={(e) =>
                    handleManualHostChange('hostName', e.target.value)
                  }
                  className="col-span-3"
                  placeholder="e.g., 192.168.1.100"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="manual-port" className="text-right">
                  Port
                </Label>
                <Input
                  id="manual-port"
                  value={formData.manualHost?.port || ''}
                  onChange={(e) =>
                    handleManualHostChange('port', e.target.value)
                  }
                  className="col-span-3"
                  placeholder="22"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="manual-user" className="text-right">
                  User
                </Label>
                <Input
                  id="manual-user"
                  value={formData.manualHost?.user || ''}
                  onChange={(e) =>
                    handleManualHostChange('user', e.target.value)
                  }
                  className="col-span-3"
                  placeholder="e.g., root"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="manual-identity" className="text-right">
                  Identity File
                </Label>
                <Input
                  id="manual-identity"
                  value={formData.manualHost?.identityFile || ''}
                  onChange={(e) =>
                    handleManualHostChange('identityFile', e.target.value)
                  }
                  className="col-span-3"
                  placeholder="~/.ssh/id_rsa (optional)"
                />
              </div>
            </>
          )}
          {/* GatewayPorts Checkbox */}
          <div className="grid grid-cols-4 items-center gap-4">
            <div className="col-start-2 col-span-3 flex items-center space-x-2">
              <Checkbox
                id="gateway-ports"
                checked={formData.gatewayPorts}
                onCheckedChange={(checked) =>
                  handleChange('gatewayPorts', Boolean(checked))
                }
              />
              <Label htmlFor="gateway-ports" className="text-sm font-normal">
                Allow remote connections (GatewayPorts)
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSave(false)} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          <Button onClick={() => void handleSave(true)} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save and Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
