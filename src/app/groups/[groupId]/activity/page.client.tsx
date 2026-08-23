import { ActivityList } from '@/app/groups/[groupId]/activity/activity-list'
import { SheetHeader } from '@/components/sheet-header'
import { Card, CardContent } from '@/components/ui/card'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'

export const metadata: Metadata = {
  title: 'Activity',
}

export function ActivityPageClient() {
  const t = useTranslations('Activity')

  return (
    <Card bleed className="mb-4">
      {/* The one screen in the app with no figure to lead with — it is a feed of sentences, not a
          column of amounts — so it gets the header without one rather than a reserved empty box.
          Whether it should stay a feed at all is an open question, and not one to settle here. */}
      <SheetHeader label={t('title')} context={t('description')} />
      {/* px-4 sm:px-6 to match the header — CardContent's own p-6 left the date rules at a
          different inset from the label above them. */}
      <CardContent className="flex flex-col space-y-4 px-4 sm:px-6">
        <ActivityList />
      </CardContent>
    </Card>
  )
}
