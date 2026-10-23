'use client'

import { ReactNode, createContext, useContext } from 'react'

type EnvContextType = {
  NEXT_PUBLIC_BASE_PATH: string
  /** Whether S3 document storage is configured, so client code can avoid the upload path when not. */
  ENABLE_EXPENSE_DOCUMENTS: boolean
}

const EnvContext = createContext<EnvContextType>({
  NEXT_PUBLIC_BASE_PATH: '',
  ENABLE_EXPENSE_DOCUMENTS: false,
})

export function useEnv() {
  return useContext(EnvContext)
}

export function EnvProvider({
  basePath,
  enableExpenseDocuments,
  children,
}: {
  basePath: string
  enableExpenseDocuments: boolean
  children: ReactNode
}) {
  return (
    <EnvContext.Provider
      value={{
        NEXT_PUBLIC_BASE_PATH: basePath,
        ENABLE_EXPENSE_DOCUMENTS: enableExpenseDocuments,
      }}
    >
      {children}
    </EnvContext.Provider>
  )
}
