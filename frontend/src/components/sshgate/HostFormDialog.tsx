import { useDialog } from '@/hooks/useDialog'
import { types } from '@wailsjs/go/models'
import { useEffect, useState } from 'react'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { SavePasswordForAlias, SaveSSHHost } from '@wailsjs/go/sshgate/Service'
import { DialogContent } from '../ui/dialog'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

interface HostFormDialogProps {
  host: types.SSHHost | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSave: () => void
}

export function HostFormDialog(props: HostFormDialogProps) {
  const { host, isOpen, onOpenChange, onSave } = props
  const { showDialog } = useDialog()
  const [formData, setFormData] = useState<types.SSHHost>({} as types.SSHHost)

  const [password, setPassword] = useState('')
  const [savePassword, setSavePassword] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setSavePassword(true)
      if (host) {
        setFormData(host)
      } else {
        setFormData({
          alias: '',
          hostName: '',
          user: '',
          port: '22',
          identityFile: '',
        } as types.SSHHost)
      }
    }
  }, [isOpen, host])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    // 直接使用当前状态更新，可能获取到旧的状态值
    // setFormData({
    //   ...formData,
    //   [name]: value,
    // })

    // 使用函数式更新，确保使用最新的状态值
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    const errors = []
    if (!formData.alias) {
      errors.push('Alias is required.')
    } else if (/\s/.test(formData.alias)) {
      errors.push('Alias cannot contain spaces.')
    }
    if (!formData.hostName) {
      errors.push('HostName is required.')
    }
    if (!formData.user) {
      errors.push('User is required.')
    }

    if (errors.length > 0) {
      await showDialog({
        type: 'error',
        title: 'Validation Error',
        message: errors.join('\n'),
      })
      return
    }
    try {
      await SaveSSHHost(formData)
      if (password && savePassword) {
        await SavePasswordForAlias(formData.alias, password)
      }
      onSave()
      onOpenChange(false)
      await showDialog({
        type: 'success',
        title: 'Success',
        message: 'Host saved successfully.',
      })
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Save Error',
        message: `Failed to save host: ${String(error)}`,
      })
    }
  }
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {host ? `Edit Host: ${host.alias}` : 'Add New SSH Host'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="alias" className="justify-self-end">
              Alias
            </Label>
            <Input
              id="alias"
              name="alias"
              value={formData.alias}
              onChange={handleInputChange}
              className="col-span-3 normal-case"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={!!host}
            ></Input>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="hostName" className="justify-self-end">
              HostName
            </Label>
            <Input
              id="hostName"
              name="hostName"
              value={formData.hostName}
              onChange={handleInputChange}
              className="col-span-3 normal-case"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            ></Input>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="user" className="justify-self-end">
              User
            </Label>
            <Input
              id="user"
              name="user"
              value={formData.user}
              onChange={handleInputChange}
              className="col-span-3 normal-case"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            ></Input>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="port" className="justify-self-end">
              Port
            </Label>
            <Input
              id="port"
              name="port"
              value={formData.port}
              onChange={handleInputChange}
              className="col-span-3 normal-case"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            ></Input>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="identityFile" className="justify-self-end">
              IdentityFile
            </Label>
            <Input
              id="identityFile"
              name="identityFile"
              value={formData.identityFile}
              onChange={handleInputChange}
              className="col-span-3 normal-case"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            ></Input>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSave()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
