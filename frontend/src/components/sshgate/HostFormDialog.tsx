import { useDialog } from '@/hooks/useDialog'
import { types } from '@wailsjs/go/models'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { SaveSSHHost } from '@wailsjs/go/sshgate/Service'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

// 1. 将 schema 创建移入一个函数，以便动态地进行唯一性校验
const createHostSchema = (
  allHosts: types.SSHHost[],
  originalAlias: string | null
) =>
  z.object({
    alias: z
      .string()
      .trim()
      .min(1, { message: 'Alias is required.' })
      .refine((val) => !/\s/.test(val), {
        message: 'Alias cannot contain spaces.',
      })
      .refine(
        (val) => {
          // 如果是编辑模式且别名未改变，则校验通过
          if (originalAlias && val === originalAlias) {
            return true
          }
          // 否则，检查新别名是否已被其他主机使用
          return !allHosts.some((h) => h.alias === val)
        },
        {
          message: 'This alias is already in use.',
        }
      ),
    hostName: z
      .string()
      .trim()
      .min(1, { message: 'HostName is required.' })
      .refine(
        (val) => {
          // 1. Check for valid IPv6 first, as it can contain letters.
          if (z.ipv6().safeParse(val).success) {
            return true
          }

          // 2. Check if the string looks like it's intended to be an IPv4 address.
          const isPotentiallyIpv4 = /^[0-9.]+$/.test(val)

          if (isPotentiallyIpv4) {
            // If it looks like an IPv4, it MUST be a valid one.
            // We don't fall back to hostname validation for strings like "192.168.1.1234".
            return z.ipv4().safeParse(val).success
          }

          // 3. If it's not an IPv6 and doesn't look like an IPv4, validate as a hostname.
          const hostnameRegex =
            /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/
          return hostnameRegex.test(val)
        },
        { message: 'Must be a valid IP address or hostname.' }
      ),
    user: z.string().trim().min(1, { message: 'User is required.' }),
    port: z.string().trim().optional(),
    identityFile: z.string().trim().optional(),
  })

interface HostFormDialogProps {
  host: types.SSHHost | null
  allHosts: types.SSHHost[]
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSave: () => void
}

export function HostFormDialog(props: HostFormDialogProps) {
  const { host, allHosts, isOpen, onOpenChange, onSave } = props
  const { showDialog } = useDialog()

  // 使用 useMemo 动态创建 schema，以避免不必要的重计算
  const hostSchema = useMemo(
    () => createHostSchema(allHosts, host?.alias ?? null),
    [allHosts, host]
  )

  // 从动态 schema 推断类型
  type HostFormValues = z.infer<typeof hostSchema>

  // 2. 使用 react-hook-form 设置表单
  const form = useForm<HostFormValues>({
    resolver: zodResolver(hostSchema),
    defaultValues: {
      alias: '',
      hostName: '',
      user: '',
      port: '22',
      identityFile: '',
    },
  })

  // 监视 hostName 字段的变化，以提供重复警告
  const hostNameValue = form.watch('hostName')
  const isHostNameDuplicate = useMemo(() => {
    if (!hostNameValue) return false
    // 如果是编辑模式，则排除当前主机自身
    const otherHosts = host
      ? allHosts.filter((h) => h.alias !== host.alias)
      : allHosts
    // 检查是否有其他主机的 HostName 与当前输入值相同
    return otherHosts.some((h) => h.hostName === hostNameValue.trim())
  }, [hostNameValue, allHosts, host])

  // 3. 当对话框打开或编辑的 host 变化时，重置表单
  useEffect(() => {
    if (isOpen) {
      const defaultValues = host
        ? {
            alias: host.alias,
            hostName: host.hostName,
            user: host.user,
            port: host.port || '22',
            identityFile: host.identityFile || '',
          }
        : {
            alias: '',
            hostName: '',
            user: '',
            port: '22',
            identityFile: '',
          }
      form.reset(defaultValues)
    }
  }, [isOpen, host, form])

  // 4. 处理表单提交
  const onSubmit = async (data: HostFormValues) => {
    try {
      // Wails 生成的 Go struct 类型要求所有字段都是 string，
      // 而 Zod schema 将可选字段推断为 string | undefined。
      // 在这里进行转换以匹配后端类型。
      const payload: types.SSHHost = {
        ...data,
        port: data.port ?? '22',
        identityFile: data.identityFile ?? '~/.ssh/id_rsa',
      }

      // If we are editing, `host` prop is not null. Its alias is the original alias.
      // If we are creating, `host` is null, so original alias is empty.
      const originalAlias = host ? host.alias : ''

      await SaveSSHHost(payload, originalAlias)
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
          <DialogTitle>{host ? 'Edit Host' : 'New Host'}</DialogTitle>
          <DialogDescription>
            Enter the details for the SSH host. All fields are parsed from
            `~/.ssh/config`.
          </DialogDescription>
        </DialogHeader>
        {/* 5. 使用 Form 组件包裹表单 */}
        <Form {...form}>
          <form
            onSubmit={(e) => {
              // 包装 handleSubmit 以满足 ESLint 的 no-misused-promises 规则
              void form.handleSubmit(onSubmit)(e)
            }}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="alias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alias</FormLabel>
                  <FormControl>
                    <Input placeholder="my-server" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hostName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HostName</FormLabel>
                  <FormControl>
                    <Input placeholder="192.168.1.100" {...field} />
                  </FormControl>
                  {isHostNameDuplicate && (
                    <FormDescription className="text-orange-500">
                      Warning: This IP address or hostname is already used by
                      another host.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="user"
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
              name="port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="22" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="identityFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IdentityFile (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="~/.ssh/id_rsa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
