import { SettingsContent } from '@/app/settings/settings-content'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  return <SettingsContent vapidKey={vapidPublicKey} />
}
