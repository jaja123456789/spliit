'use client'
import { createContext, useContext } from 'react'

/**
 * Which expense the form's live per-person figures are for, and the rule its spare cents follow
 * (see `remainderRule` in the schema): an expense being edited keeps its own, a new one gets the
 * current rule and the id it will be saved under. Without them the preview could show a cent going
 * to a different person than the saved expense will.
 */
export type ShareIdentity = { id?: string; remainderRule: number }

export const ShareIdentityContext = createContext<ShareIdentity>({
  remainderRule: 2,
})

export const useShareIdentity = () => useContext(ShareIdentityContext)
