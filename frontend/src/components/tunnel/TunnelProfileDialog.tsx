import React, { useEffect, useMemo, useState } from 'react'
import { sshgate, sshtunnel } from '@wailsjs/go/models'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { formatTunnelDescription } from '@/lib/tunnel-utils'
import { Loader2, Plus, Trash2 } from 'lucide-react'

interface TunnelProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profiles: sshgate.TunnelProfile[]
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  onSaveProfile: (profile: sshgate.TunnelProfile) => Promise<void>
  onDeleteProfile: (id: string) => Promise<void>
}

const newProfileId = '__new__'

export function TunnelProfileDialog({
  open,
  onOpenChange,
  profiles,
  savedTunnels,
  onSaveProfile,
  onDeleteProfile,
}: TunnelProfileDialogProps) {
  const [selectedProfileId, setSelectedProfileId] = useState(newProfileId)
  const [name, setName] = useState('')
  const [selectedTunnelIds, setSelectedTunnelIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedProfile = useMemo(() => {
    return profiles.find((profile) => profile.id === selectedProfileId)
  }, [profiles, selectedProfileId])

  useEffect(() => {
    if (!open) return

    if (selectedProfile) {
      setName(selectedProfile.name)
      setSelectedTunnelIds(selectedProfile.tunnelIds ?? [])
      return
    }

    if (profiles.length > 0 && selectedProfileId !== newProfileId) {
      setSelectedProfileId(profiles[0].id)
      return
    }

    setName('')
    setSelectedTunnelIds([])
  }, [open, profiles, selectedProfile, selectedProfileId])

  const handleCreateNew = () => {
    setSelectedProfileId(newProfileId)
    setName('')
    setSelectedTunnelIds([])
  }

  const handleToggleTunnel = (tunnelId: string, checked: boolean) => {
    setSelectedTunnelIds((current) => {
      if (checked) {
        return current.includes(tunnelId) ? current : [...current, tunnelId]
      }
      return current.filter((id) => id !== tunnelId)
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSaveProfile(
        new sshgate.TunnelProfile({
          id: selectedProfile?.id ?? '',
          name,
          tunnelIds: selectedTunnelIds,
          createdAt: selectedProfile?.createdAt ?? '',
          updatedAt: selectedProfile?.updatedAt ?? '',
        })
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedProfile) return

    setIsDeleting(true)
    try {
      await onDeleteProfile(selectedProfile.id)
      setSelectedProfileId(newProfileId)
    } finally {
      setIsDeleting(false)
    }
  }

  const isBusy = isSaving || isDeleting
  const canSave = name.trim().length > 0 && !isBusy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tunnel Profiles</DialogTitle>
          <DialogDescription>
            Group saved tunnels and start them together from the dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[180px_1fr] gap-4 min-h-[360px]">
          <div className="border-r pr-3 space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleCreateNew}
              disabled={isBusy}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Profile
            </Button>
            <div className="space-y-1">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${
                    selectedProfileId === profile.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedProfileId(profile.id)}
                  disabled={isBusy}
                >
                  <div className="font-medium truncate">{profile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {profile.tunnelIds?.length ?? 0} tunnels
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Backend workspace"
                disabled={isBusy}
              />
            </div>

            <div className="space-y-2">
              <Label>Saved Tunnels</Label>
              <div className="border rounded-md max-h-[240px] overflow-y-auto">
                {savedTunnels.length > 0 ? (
                  savedTunnels.map((tunnel) => {
                    const checked = selectedTunnelIds.includes(tunnel.id)
                    return (
                      <label
                        key={tunnel.id}
                        className="flex items-start gap-3 border-b last:border-b-0 px-3 py-2 hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            handleToggleTunnel(tunnel.id, value === true)
                          }
                          disabled={isBusy}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium truncate">
                            {tunnel.name}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {formatTunnelDescription(tunnel)}
                          </span>
                        </span>
                      </label>
                    )
                  })
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No saved tunnels.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={!selectedProfile || isBusy}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
