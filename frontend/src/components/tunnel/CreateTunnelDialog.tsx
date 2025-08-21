import React, { useEffect } from 'react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SaveTunnelConfig } from '@wailsjs/go/sshgate/Service'
import { sshtunnel, types } from '@wailsjs/go/models'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

// --- Zod Schema for Validation ---
const formSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, 'Tunnel name is required.'),
    tunnelType: z.enum(['local', 'dynamic']),
    localPort: z.string().regex(/^\d+$/, 'Port must be a valid number.'),
    gatewayPorts: z.boolean(),
    remoteHost: z.string().optional(),
    remotePort: z
      .string()
      .regex(/^\d*$/, 'Port must be a valid number.')
      .optional(),
    hostSource: z.enum(['ssh_config', 'manual']),
    hostAlias: z.string().optional(),
    manualHost: z
      .object({
        hostName: z.string().optional(),
        port: z.string().optional(),
        user: z.string().optional(),
        identityFile: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tunnelType === 'local') {
      if (!data.remoteHost?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Remote Host is required for local tunnels.',
          path: ['remoteHost'],
        })
      }
      if (!data.remotePort?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Remote Port is required for local tunnels.',
          path: ['remotePort'],
        })
      }
    }
    // Additional validation for port ranges, since they are strings now
    const localPortNum = parseInt(data.localPort, 10)
    if (
      Number.isNaN(localPortNum) ||
      localPortNum < 1 ||
      localPortNum > 65535
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Port must be between 1 and 65535.',
        path: ['localPort'],
      })
    }
    if (data.remotePort && data.remotePort.trim() !== '') {
      const remotePortNum = parseInt(data.remotePort, 10)
      if (
        Number.isNaN(remotePortNum) ||
        remotePortNum < 1 ||
        remotePortNum > 65535
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Port must be between 1 and 65535.',
          path: ['remotePort'],
        })
      }
    }
    if (data.hostSource === 'ssh_config' && !data.hostAlias) {
      ctx.addIssue({
        code: 'custom',
        message: 'Please select a host.',
        path: ['hostAlias'],
      })
    }
    if (data.hostSource === 'manual') {
      if (!data.manualHost?.hostName) {
        ctx.addIssue({
          code: 'custom',
          message: 'Hostname is required.',
          path: ['manualHost.hostName'],
        })
      }
      if (!data.manualHost?.user) {
        ctx.addIssue({
          code: 'custom',
          message: 'User is required.',
          path: ['manualHost.user'],
        })
      }
      if (!data.manualHost?.port) {
        ctx.addIssue({
          code: 'custom',
          message: 'Port is required.',
          path: ['manualHost.port'],
        })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

interface CreateTunnelDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  hosts: types.SSHHost[]
  tunnelToEdit?: sshtunnel.SavedTunnelConfig
}

export function CreateTunnelDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  hosts,
  tunnelToEdit,
}: CreateTunnelDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: '',
      name: '',
      tunnelType: 'local',
      localPort: '8080',
      gatewayPorts: false,
      remoteHost: 'localhost',
      remotePort: '3306',
      hostSource: 'ssh_config',
      hostAlias: '',
      manualHost: {
        hostName: '',
        port: '22',
        user: '',
        identityFile: '',
      },
    },
  })

  const { reset, watch, setValue } = form
  const tunnelType = watch('tunnelType')
  const hostSource = watch('hostSource')

  useEffect(() => {
    if (hostSource === 'ssh_config') {
      // Clear manual host fields when switching to ssh_config
      setValue('manualHost', { hostName: '', port: '22', user: '' })
    } else if (hostSource === 'manual') {
      // Clear host alias when switching to manual
      setValue('hostAlias', undefined)
    }
  }, [hostSource, setValue])

  useEffect(() => {
    if (tunnelType === 'dynamic') {
      setValue('remoteHost', undefined)
      setValue('remotePort', undefined)
    }
  }, [tunnelType, setValue])

  useEffect(() => {
    // Only reset the form when the dialog opens to avoid unintended changes.
    if (isOpen) {
      if (tunnelToEdit) {
        reset({
          id: tunnelToEdit.id,
          name: tunnelToEdit.name,
          tunnelType: tunnelToEdit.tunnelType as 'local' | 'dynamic',
          localPort: String(tunnelToEdit.localPort),
          gatewayPorts: tunnelToEdit.gatewayPorts,
          remoteHost: tunnelToEdit.remoteHost,
          remotePort: tunnelToEdit.remotePort
            ? String(tunnelToEdit.remotePort)
            : '',
          hostSource: tunnelToEdit.hostSource as 'ssh_config' | 'manual',
          hostAlias: tunnelToEdit.hostAlias,
          manualHost: {
            hostName: tunnelToEdit.manualHost?.hostName,
            port: tunnelToEdit.manualHost?.port,
            user: tunnelToEdit.manualHost?.user,
            identityFile: tunnelToEdit.manualHost?.identityFile,
          },
        })
      } else {
        reset() // Reset to default values for a new tunnel
      }
    }
  }, [isOpen, tunnelToEdit, reset])

  const onSubmit = async (values: FormValues) => {
    // Manually convert port strings to numbers before saving
    const configToSave = new sshtunnel.SavedTunnelConfig({
      ...values,
      localPort: parseInt(values.localPort, 10),
      // Ensure remotePort is a number or undefined, not an empty string from the form
      remotePort: values.remotePort
        ? parseInt(values.remotePort, 10)
        : undefined,
    })

    try {
      await SaveTunnelConfig(configToSave)
      toast.success(`Tunnel "${values.name}" saved successfully.`)
      onSuccess()
    } catch (error) {
      toast.error(`Failed to save tunnel: ${String(error)}`)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tunnelToEdit ? 'Edit' : 'Create'} SSH Tunnel Configuration
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* --- General Info --- */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tunnel Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Access Corp DB" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- Tunnel Type --- */}
            <FormField
              control={form.control}
              name="tunnelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tunnel Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="local">Local Forward (-L)</SelectItem>
                      <SelectItem value="dynamic">
                        Dynamic SOCKS5 (-D)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- Local Port --- */}
            <FormField
              control={form.control}
              name="localPort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Local Port</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- Remote Endpoint (Conditional) --- */}
            {tunnelType === 'local' && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="remoteHost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remote Host</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="localhost or an internal IP"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remotePort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remote Port</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* --- GatewayPorts --- */}
            <FormField
              control={form.control}
              name="gatewayPorts"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Allow remote connections (GatewayPorts)
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            {/* --- Host Connection --- */}
            <FormField
              control={form.control}
              name="hostSource"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Host Connection</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="ssh_config" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Use existing host from ~/.ssh/config
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="manual" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Specify host manually
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hostSource === 'ssh_config' && (
              <FormField
                control={form.control}
                name="hostAlias"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Host</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a host from your config" />
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {hostSource === 'manual' && (
              <div className="space-y-4 p-4 border rounded-md">
                <FormField
                  control={form.control}
                  name="manualHost.hostName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hostname</FormLabel>
                      <FormControl>
                        <Input placeholder="server.example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="manualHost.user"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>User</FormLabel>
                        <FormControl>
                          <Input placeholder="root" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="manualHost.port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="manualHost.identityFile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Identity File (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="~/.ssh/id_rsa" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="submit">Save Configuration</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
