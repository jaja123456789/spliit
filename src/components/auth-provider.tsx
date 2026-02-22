'use client'

import { useEnv } from '@/components/env-provider'
import { SessionProvider } from 'next-auth/react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { NEXT_PUBLIC_BASE_PATH } = useEnv()
  return (
    <SessionProvider basePath={`${NEXT_PUBLIC_BASE_PATH}/api/auth`}>
      {children}
    </SessionProvider>
  )
}
