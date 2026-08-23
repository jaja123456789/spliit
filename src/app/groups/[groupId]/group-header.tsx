'use client'

import { GroupTabBar } from '@/app/groups/[groupId]/group-tab-bar'
import { GroupTabs } from '@/app/groups/[groupId]/group-tabs'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { useCurrentGroup } from './current-group-context'

export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()

  return (
    <>
      <div className="flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 font-bold text-2xl">
            <Link href={`/groups/${groupId}`}>
              {isLoading ? (
                <Skeleton className="mt-1.5 mb-1.5 h-5 w-32" />
              ) : (
                <div className="truncate">{group.name}</div>
              )}
            </Link>
          </h1>
          {/* Share belongs to the group, so it sits beside the group's name — at every width, and
              exactly once. It used to sit next to the tab strip, taking 44px from the row six
              labels were already losing, which is a large part of why a tab was 45px wide at 360px.
              Rendering it twice and letting the breakpoint pick was the obvious way to keep it in
              both places; it also puts two identical controls in the DOM, which is a trap for
              anything that looks one up by attribute rather than by what is on screen. */}
          {group && <ShareButton group={group} />}
        </div>

        {/* The strip is the navigation from `sm` up. Below that it is `GroupTabBar`. */}
        <div className="hidden sm:flex">
          <GroupTabs groupId={groupId} />
        </div>
      </div>
      <GroupTabBar groupId={groupId} />
    </>
  )
}
