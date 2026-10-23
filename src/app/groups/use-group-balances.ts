'use client'

import { onActiveUserChange, readActiveUser } from '@/lib/active-user'
import { trpc } from '@/trpc/client'
import { useEffect, useState } from 'react'

/**
 * "What do I owe" across every group on this device.
 *
 * Which participant you are is stored per device, per group, so this can only cover groups where
 * that choice has been made — the caller is expected to say so rather than presenting a total that
 * quietly omits the rest.
 */
export function useGroupBalances(groupIds: string[]) {
  const [pairs, setPairs] = useState<
    { groupId: string; participantId: string }[]
  >([])

  // localStorage is not readable during render on the server, so the list is assembled after mount
  // — and again whenever an answer arrives, from this device or from the account.
  useEffect(() => {
    const read = () =>
      setPairs(
        groupIds
          .map((groupId) => ({
            groupId,
            participantId: readActiveUser(groupId) ?? '',
          }))
          .filter((pair) => pair.participantId !== ''),
      )
    read()
    return onActiveUserChange((groupId) => {
      if (groupIds.includes(groupId)) read()
    })
  }, [groupIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data } = trpc.groups.balances.forGroups.useQuery(
    { groups: pairs },
    { enabled: pairs.length > 0 },
  )

  const byGroup = new Map(
    (data?.balances ?? []).map((entry) => [entry.groupId, entry.balance]),
  )

  return {
    /** Balance for one group, or undefined when you have not said who you are there. */
    balanceFor: (groupId: string) => byGroup.get(groupId),
    /**
     * The groups that *do* have a balance, in minor units of each group's own currency. There is
     * no total here on purpose: summing across groups is only meaningful per currency, and the
     * currencies live with the group details — see `totalsByCurrency`.
     */
    balances: byGroup,
    coveredCount: byGroup.size,
    isPartial: byGroup.size < groupIds.length,
  }
}
