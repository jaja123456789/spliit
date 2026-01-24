'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Mail } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export function SignInForm() {
  const [email, setEmail] = useState('')

  const signInMutation = useMutation({
    mutationFn: async (email: string) => {
      const result = await signIn('email', { email, redirect: false })
      if (result?.error) {
        throw new Error(result.error)
      }
      return result
    },
    onError: (error) => {
      console.error('Sign in error:', error)
    },
  })

  const handleSignIn = () => {
    if (!email) return
    signInMutation.mutate(email)
  }

  if (signInMutation.isSuccess) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm font-medium text-green-900 dark:text-green-100">
            Check your email for the magic link
          </p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">
            We sent a sign-in link to {email}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            signInMutation.reset()
            setEmail('')
          }}
        >
          Try different email
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSignIn()
          }}
        />
      </div>
      <Button
        onClick={handleSignIn}
        disabled={!email || signInMutation.isPending}
        className="w-full sm:w-auto"
      >
        {signInMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Mail className="w-4 h-4 mr-2" />
            Send magic link
          </>
        )}
      </Button>
    </div>
  )
}
