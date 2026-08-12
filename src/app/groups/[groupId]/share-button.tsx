'use client'
import { CopyButton } from '@/components/copy-button'
import { ShareQrCodeDialog } from '@/components/share-qr-code-dialog'
import { ShareUrlButton } from '@/components/share-url-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useBaseUrl } from '@/lib/hooks'
import { Group } from '@prisma/client'
import { Share } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Props = {
  group: Group
  /**
   * Shown instead of the icon-only trigger. The empty-group screen leads with inviting people, and
   * an unlabelled icon is a poor thing to lead with.
   */
  label?: string
}

export function ShareButton({ group, label }: Props) {
  const t = useTranslations('Share')
  const baseUrl = useBaseUrl()
  const url = baseUrl && `${baseUrl}/groups/${group.id}/expenses?ref=share`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          // The labelled variant carries its own title. Two buttons both titled "Share" — the
          // header icon and the empty group's invite call to action — are indistinguishable to a
          // screen reader and to anything else looking for one of them.
          title={label ?? t('title')}
          size={label ? 'default' : 'icon'}
          className="flex-shrink-0"
        >
          <Share className="w-4 h-4" />
          {label && <span className="ml-2">{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="[&_p]:text-sm flex flex-col gap-3">
        <p>{t('description')}</p>
        {url && (
          <div className="flex gap-2">
            <Input className="flex-1" defaultValue={url} readOnly />
            <CopyButton text={url} />
            <ShareUrlButton
              text={`Join my group ${group.name} on Spliit`}
              url={url}
            />
            <ShareQrCodeDialog url={url} groupName={group.name} />
          </div>
        )}
        <p>
          <strong>{t('warning')}</strong> {t('warningHelp')}
        </p>
      </PopoverContent>
    </Popover>
  )
}
