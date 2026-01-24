'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Loader2, Settings2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import {
  AccountInfo,
  SignInForm,
  SyncAllGroups,
  SyncPreferences,
  SyncedGroupsList,
} from './components'

export function SettingsContent() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Settings2 className="w-8 h-8" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cloud Sync</CardTitle>
          <CardDescription>
            {session
              ? 'Manage your synced groups and preferences'
              : 'Sign in to sync your groups across devices'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!session ? (
            <SignInForm />
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Account</h3>
                <AccountInfo />
              </div>
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Preferences</h3>
                <SyncPreferences />
              </div>
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Actions</h3>
                <SyncAllGroups />
              </div>
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Synced Groups</h3>
                <SyncedGroupsList />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
