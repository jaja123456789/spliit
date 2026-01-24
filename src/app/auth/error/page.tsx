'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = () => {
    switch (error) {
      case 'Verification':
        return 'This magic link has expired or already been used. Please request a new one.'
      case 'Configuration':
        return 'Authentication configuration error. Please contact support.'
      default:
        return 'An authentication error occurred. Please try again.'
    }
  }

  return (
    <div className="container max-w-md py-16">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <CardTitle>Authentication Error</CardTitle>
          </div>
          <CardDescription>Unable to sign you in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{getErrorMessage()}</p>
          <Button asChild className="w-full">
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={<div className="container max-w-md py-16">Loading...</div>}
    >
      <AuthErrorContent />
    </Suspense>
  )
}
