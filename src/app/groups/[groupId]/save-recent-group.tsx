'use client'
import { useGroupActions } from '@/contexts'
import { useEffect, useRef } from 'react'
import { useCurrentGroup } from './current-group-context'

export function SaveGroupLocally() {
  const { group } = useCurrentGroup()
  const { saveRecentGroup } = useGroupActions()
  // Track the last saved ID to prevent infinite loops when saveRecentGroup changes identity
  const lastSavedId = useRef<string | null>(null)

  useEffect(() => {
    if (group && group.id !== lastSavedId.current) {
      // Fire and forget - we don't need to wait for the result
      saveRecentGroup({ id: group.id, name: group.name })
      lastSavedId.current = group.id
    }
  }, [group, saveRecentGroup])

  return null
}
