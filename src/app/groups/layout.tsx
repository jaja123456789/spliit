import { PropsWithChildren, Suspense } from 'react'
import { GroupsMain } from './groups-main'

export default function GroupsLayout({ children }: PropsWithChildren<{}>) {
  return (
    <Suspense>
      <GroupsMain>{children}</GroupsMain>
    </Suspense>
  )
}
