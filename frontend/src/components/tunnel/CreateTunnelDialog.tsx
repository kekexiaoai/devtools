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
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface CreateTunnelDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSuccess: (shouldStart: boolean) => void
  hosts: types.SSHHost[]
  tunnelToEdit?: sshtunnel.SavedTunnelConfig
}

// Zod schema for validation
const tunnelFormSchema = z
  .object({
    name: z.string().trim().min(1, { message: 'Tunnel Name is required.' }),
    tunnelType: z.enum(['local', 'dynamic']),
    localPort: z
      .number()
      .min(1, 'Port must be > 0')
      .max(65535, 'Port must be < 65536'),
    gatewayPorts: z.boolean(),
    remoteHost: z.string().optional(),
    remotePort: z.number().optional(),
    hostSource: z.enum(['ssh_config', 'manual']),
    hostAlias: z.string().optional(),
    manualHost: z
      .object({
        hostName: z.string(),
        port: z.string(),
        user: z.string(),
        identityFile: z.string(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Conditional validation for local forwarding
    if (data.tunnelType === 'local') {
      if (!data.remoteHost?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['remoteHost'],
          message: 'Remote Host is required.',
        })
      }
      if (data.remotePort === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['remotePort'],
          message: 'Remote Port is required.',
        })
      } else if (data.remotePort <= 0 || data.remotePort > 65535) {
        ctx.addIssue({
          code: 'custom',
          path: ['remotePort'],
          message: 'Port must be between 1 and 65535.',
        })
      }
    }

    // Conditional validation for host source
    if (data.hostSource === 'ssh_config' && !data.hostAlias) {
      ctx.addIssue({
        code: 'custom',
        path: ['hostAlias'],
        message: 'An SSH Host alias must be selected.',
      })
    }

    if (data.hostSource === 'manual') {
      if (!data.manualHost?.hostName.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['manualHost.hostName'],
          message: 'Host Name is required.',
        })
      }
      if (!data.manualHost?.user.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['manualHost.user'],
          message: 'User is required.',
        })
      }
    }
  })

type TunnelFormValues = z.infer<typeof tunnelFormSchema>

const initialFormState: TunnelFormValues = {
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
}

export function CreateTunnelDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  hosts,
  tunnelToEdit,
}: CreateTunnelDialogProps) {
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<TunnelFormValues>({
    resolver: zodResolver(tunnelFormSchema),
    defaultValues: initialFormState,
  })

  useEffect(() => {
    if (isOpen) {
      if (tunnelToEdit) {
        // Editing an existing tunnel
        form.reset({
          ...tunnelToEdit,
          tunnelType: tunnelToEdit.tunnelType as 'local' | 'dynamic',
          hostSource: tunnelToEdit.hostSource as 'ssh_config' | 'manual',
          // Provide a default for manualHost if it's null/undefined from the backend data
          // to ensure the form fields are controlled.
          manualHost: tunnelToEdit.manualHost ?? {
            hostName: '',
            port: '22',
            user: '',
            identityFile: '',
          },
        })
      } else {
        // Creating a new tunnel, set defaults
        const newForm = { ...initialFormState }
        if (newForm.hostSource === 'ssh_config' && hosts.length > 0) {
          newForm.hostAlias = hosts[0].alias
        } else {
          newForm.hostAlias = ''
        }
        form.reset(newForm)
      }
    }
  }, [isOpen, tunnelToEdit, hosts, form])

  const hostSource = form.watch('hostSource')
  useEffect(() => {
    if (!form.formState.isDirty) return

    if (hostSource === 'manual') {
      form.setValue('hostAlias', '')
    } else if (hostSource === 'ssh_config') {
      form.setValue('hostAlias', hosts.length > 0 ? hosts[0].alias : '')
    }
  }, [hostSource, form, hosts])

  const handleSave = async (data: TunnelFormValues, shouldStart: boolean) => {
    setIsSaving(true)
    try {
      const configData = {
        ...data,
        id: tunnelToEdit?.id || '', // Empty ID means create new
        hostAlias:
          data.hostSource === 'ssh_config' ? data.hostAlias : undefined,
        manualHost: data.hostSource === 'manual' ? data.manualHost : undefined,
      }
      const configToSave = new sshtunnel.SavedTunnelConfig(configData)

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

  const tunnelType = form.watch('tunnelType')

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
        <Form {...form}>
          <form
            // Set the default form submission to "Save"
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit((data) => handleSave(data, true))(e)
            }}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Name</FormLabel>
                  <FormControl className="col-span-3">
                    <Input {...field} />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tunnelType"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="local">Local Forward (-L)</SelectItem>
                      <SelectItem value="dynamic">Dynamic (SOCKS5)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="localPort"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Local Port</FormLabel>
                  <FormControl className="col-span-3">
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />

            {tunnelType === 'local' && (
              <>
                <FormField
                  control={form.control}
                  name="remoteHost"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Remote Host</FormLabel>
                      <FormControl className="col-span-3">
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage className="col-start-2 col-span-3" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remotePort"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Remote Port</FormLabel>
                      <FormControl className="col-span-3">
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ''
                                ? undefined
                                : parseInt(e.target.value, 10)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage className="col-start-2 col-span-3" />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="hostSource"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">SSH Host</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ssh_config">
                        From ~/.ssh/config
                      </SelectItem>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />

            {hostSource === 'ssh_config' && (
              <FormField
                control={form.control}
                name="hostAlias"
                render={({ field }) => (
                  <FormItem className="grid grid-cols-4 items-center gap-4">
                    <FormLabel className="text-right">Host Alias</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ''}
                    >
                      <FormControl className="col-span-3">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {hosts.map((host) => (
                          <SelectItem key={host.alias} value={host.alias}>
                            {host.alias}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="col-start-2 col-span-3" />
                  </FormItem>
                )}
              />
            )}

            {hostSource === 'manual' && (
              <>
                <FormField
                  control={form.control}
                  name="manualHost.hostName"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Host Name</FormLabel>
                      <FormControl className="col-span-3">
                        <Input
                          placeholder="e.g., 192.168.1.100"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage className="col-start-2 col-span-3" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manualHost.port"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Port</FormLabel>
                      <FormControl className="col-span-3">
                        <Input
                          placeholder="22"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage className="col-start-2 col-span-3" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manualHost.user"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">User</FormLabel>
                      <FormControl className="col-span-3">
                        <Input
                          placeholder="e.g., root"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage className="col-start-2 col-span-3" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manualHost.identityFile"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">
                        Identity File
                      </FormLabel>
                      <FormControl className="col-span-3">
                        <Input
                          placeholder="~/.ssh/id_rsa (optional)"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage className="col-start-2 col-span-3" />
                    </FormItem>
                  )}
                />
              </>
            )}
            <FormField
              control={form.control}
              name="gatewayPorts"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <div className="col-start-2 col-span-3 flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        id="gateway-ports"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <Label
                      htmlFor="gateway-ports"
                      className="text-sm font-normal"
                    >
                      Allow remote connections (GatewayPorts)
                    </Label>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void form.handleSubmit((data) => handleSave(data, false))()
                }}
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
              <Button
                type="submit" // This is now the default action on Enter
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save and Start
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
