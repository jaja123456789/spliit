'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { clearSyncRestoreFlag } from '@/lib/sync-restore'
import { LogOut } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AccountInfo() {
  const { data: session } = useSession()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const router = useRouter()

  const handleLogout = async (clearLocalData: boolean) => {
    if (clearLocalData) {
      localStorage.removeItem('recentGroups')
      localStorage.removeItem('starredGroups')
      localStorage.removeItem('archivedGroups')
    }
    clearSyncRestoreFlag()
    await signOut({ redirect: false })
    setShowLogoutDialog(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <div>
          <p className="text-sm font-medium">Signed in as</p>
          <p className="text-sm text-muted-foreground">
            {session?.user?.email}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLogoutDialog(true)}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to clear synced groups from this device?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => handleLogout(false)}>
              No, keep groups
            </Button>
            <AlertDialogAction onClick={() => handleLogout(true)}>
              Yes, clear groups
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
