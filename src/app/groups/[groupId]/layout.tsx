import { cached } from '@/app/cached-functions'
import { Metadata } from 'next'
import { PropsWithChildren } from 'react'
import { GroupLayoutClient } from './layout.client'

type Props = {
  params: Promise<{
    groupId: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupId } = await params
  const group = await cached.getGroup(groupId)

  return {
    title: {
      default: group?.name ?? '',
      template: `%s · ${group?.name} · Spliit`,
    },
    // A group's address is its only key. Should one ever be linked from a public page, it should
    // not also turn up in search results.
    robots: { index: false, follow: false },
  }
}

export default async function GroupLayout({
  children,
  params,
}: PropsWithChildren<Props>) {
  const { groupId } = await params
  return <GroupLayoutClient groupId={groupId}>{children}</GroupLayoutClient>
}
