import React from 'react'
import { toast } from 'sonner'
import { ClipboardCopy } from 'lucide-react'

export function CopyableAddress({ address }: { address: string }) {
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent any parent onClick handlers
    navigator.clipboard
      .writeText(address)
      .then(() => {
        toast.success('Copied to clipboard!', {
          description: address,
        })
      })
      .catch((err) => {
        toast.error('Failed to copy address.')
        console.error('Failed to copy:', err)
      })
  }

  return (
    <button
      onClick={handleCopy}
      className="font-mono text-sm bg-muted px-2 py-1 rounded hover:bg-primary/20 transition-colors flex items-center gap-1.5"
      title="Copy to clipboard"
    >
      {address}
      <ClipboardCopy className="h-3 w-3 text-muted-foreground" />
    </button>
  )
}
