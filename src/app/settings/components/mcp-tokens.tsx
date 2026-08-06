'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { useBaseUrl } from '@/lib/hooks'
import { trpc } from '@/trpc/client'
import { Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function McpTokens() {
  const t = useTranslations('Settings.McpTokens')
  const { toast } = useToast()
  const baseUrl = useBaseUrl()
  const [name, setName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const { data: tokens, isLoading, refetch } = trpc.mcp.listTokens.useQuery()
  const createToken = trpc.mcp.createToken.useMutation({
    onSuccess: (created) => {
      setNewToken(created.token)
      setName('')
      refetch()
    },
  })
  const revokeToken = trpc.mcp.revokeToken.useMutation({
    onSuccess: () => refetch(),
  })

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast({ description: t('copyFailed'), variant: 'destructive' })
    }
  }

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {baseUrl && (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('serverUrl')}</p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={`${baseUrl}/api/mcp`}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => copy(`${baseUrl}/api/mcp`, 'url')}
            >
              {copied === 'url' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Shown once, immediately after creation: only the hash is stored. */}
      {newToken && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 space-y-2">
          <p className="text-sm font-medium">{t('newToken.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('newToken.description')}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={newToken}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => copy(newToken, 'token')}
            >
              {copied === 'token' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNewToken(null)}
          >
            {t('newToken.dismiss')}
          </Button>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) createToken.mutate({ name: name.trim() })
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={60}
          className="text-base"
        />
        <Button
          type="submit"
          variant="secondary"
          className="shrink-0"
          disabled={!name.trim() || createToken.isPending}
        >
          {createToken.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          {t('create')}
        </Button>
      </form>

      {tokens && tokens.length > 0 ? (
        <ul className="divide-y border-t">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between py-2 gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  {token.lastUsedAt
                    ? t('lastUsed', {
                        date: new Date(token.lastUsedAt).toLocaleDateString(),
                      })
                    : t('neverUsed')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                title={t('revoke')}
                disabled={revokeToken.isPending}
                onClick={() => revokeToken.mutate({ tokenId: token.id })}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}
    </div>
  )
}
