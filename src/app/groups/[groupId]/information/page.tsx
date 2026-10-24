import { redirect } from 'next/navigation'

/**
 * Information used to be a destination of its own, for one paragraph. It is the "About this group"
 * section of Balances now; links and bookmarks to the old address land there.
 */
export default async function InformationPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  redirect(`/groups/${groupId}/balances`)
}
