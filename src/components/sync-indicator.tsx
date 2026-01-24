'use client'

import { Loader2 } from 'lucide-react'

export function SyncIndicator() {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>Syncing...</span>
    </div>
  )
}
