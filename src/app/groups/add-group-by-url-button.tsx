'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useGroupActions } from '@/contexts'
import { useMediaQuery } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Link as LinkIcon, Loader2, Plus, QrCode } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState } from 'react'

// The scanner pulls in html5-qrcode (~110 kB gzipped), which would otherwise sit in the bundle of
// the page the app opens on. Load it when the user actually switches to scanning.
const QrCodeScanner = dynamic(
  () => import('@/components/qr-code-scanner').then((m) => m.QrCodeScanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
)

type Props = {
  reload?: () => void
}

export function AddGroupByUrlButton({ reload }: Props) {
  const { saveRecentGroup } = useGroupActions()
  const t = useTranslations('Groups.AddByURL')
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const [scanError, setScanError] = useState('')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const utils = trpc.useUtils()

  const processUrl = async (urlToProcess: string) => {
    const [, groupId] =
      urlToProcess.match(
        new RegExp(`${window.location.origin}/groups/([^/]+)`),
      ) ??
      urlToProcess.match(/\/groups\/([^/?]+)/) ?? // Also match relative URLs from QR
      []

    if (!groupId) {
      setError(true)
      setScanError('')
      setPending(false)
      return
    }

    setPending(true)
    try {
      const { group } = await utils.groups.get.fetch({
        groupId: groupId,
      })
      if (group) {
        saveRecentGroup({ id: group.id, name: group.name })
        reload?.()
        setUrl('')
        setOpen(false)
        setScanMode(false)
        setError(false)
        setScanError('')
      } else {
        setError(true)
        setScanError('')
      }
    } catch (err) {
      setError(true)
      setScanError('')
    } finally {
      setPending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Quiet, under the list. It stood beside Create, as large as it, for something done far
          less often: a shared link usually opens the group by itself, and that adds it here. */}
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 gap-2 self-start text-muted-foreground"
        >
          <LinkIcon className="h-4 w-4" aria-hidden />
          {t('button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="[&_p]:text-sm flex flex-col gap-3"
      >
        <h3 className="font-bold">{t('title')}</h3>
        <p>{t('description')}</p>

        {!isDesktop && (
          // One choice between two ways in, drawn as one: the chosen way raised in ink, like the
          // theme switch and the split modes. Filled green on the chosen one said "press me" of
          // the button that was already pressed.
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {(
              [
                [false, LinkIcon, t('urlMode')],
                [true, QrCode, t('qrMode')],
              ] as const
            ).map(([scan, Icon, label]) => (
              <Button
                key={label}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={scanMode === scan}
                className={cn(
                  'h-9 gap-2',
                  scanMode === scan
                    ? 'bg-card text-foreground shadow-sm hover:bg-card'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => {
                  setScanMode(scan)
                  setError(false)
                  setScanError('')
                }}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        )}

        {!scanMode ? (
          <form
            className="flex gap-2 flex-wrap"
            onSubmit={async (event) => {
              event.preventDefault()
              await processUrl(url)
            }}
          >
            <Input
              type="url"
              required
              placeholder="https://spliit.app/..."
              className="flex-1 min-w-[200px] text-base sm:text-base"
              value={url}
              disabled={pending}
              onChange={(event) => {
                setUrl(event.target.value)
                setError(false)
                setScanError('')
              }}
            />
            <Button
              size="icon"
              type="submit"
              disabled={pending}
              className="flex-shrink-0"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </Button>
          </form>
        ) : (
          <QrCodeScanner
            onScan={(scannedUrl) => {
              processUrl(scannedUrl)
            }}
            onError={(errorMsg) => {
              setScanError(errorMsg)
              setError(false)
            }}
            onClose={() => setScanMode(false)}
          />
        )}

        {error && <p className="text-destructive">{t('error')}</p>}
        {scanError && <p className="text-destructive">{scanError}</p>}
      </PopoverContent>
    </Popover>
  )
}
