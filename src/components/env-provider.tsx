'use client'

import { ReactNode, createContext, useContext } from 'react'

type EnvContextType = {
  NEXT_PUBLIC_BASE_PATH: string
}

const EnvContext = createContext<EnvContextType>({
  NEXT_PUBLIC_BASE_PATH: '',
})

export function useEnv() {
  return useContext(EnvContext)
}

export function EnvProvider({
  basePath,
  children,
}: {
  basePath: string
  children: ReactNode
}) {
  return (
    <EnvContext.Provider value={{ NEXT_PUBLIC_BASE_PATH: basePath }}>
      {children}
    </EnvContext.Provider>
  )
}
