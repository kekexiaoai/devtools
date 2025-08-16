import { useDialog } from '@/hooks/useDialog'
import { types } from '@wailsjs/go/models'
import { useEffect } from 'react'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

// 1. 使用 Zod 定义表单验证 schema
const hostSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1, { message: 'Alias is required.' })
    .refine((val) => !/\s/.test(val), {
      message: 'Alias cannot contain spaces.',
    }),
  hostName: z.string().trim().min(1, { message: 'HostName is required.' }),
  user: z.string().trim().min(1, { message: 'User is required.' }),
  port: z.string().trim().optional(),
  identityFile: z.string().trim().optional(),
})

// 从 schema 推断出 TypeScript 类型
type HostFormValues = z.infer<typeof hostSchema>
interface HostFormDialogProps {
  host: types.SSHHost | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSave: () => void
}

export function HostFormDialog(props: HostFormDialogProps) {
  const { host, isOpen, onOpenChange, onSave } = props
  const { showDialog } = useDialog()

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
        port: data.port ?? '',
        identityFile: data.identityFile ?? '',
      }
      await SaveSSHHost(payload)
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
                    <Input
                      placeholder="my-server"
                      {...field}
                      disabled={!!host}
                    />
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
