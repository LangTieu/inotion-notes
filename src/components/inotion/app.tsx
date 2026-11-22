'use client'

import { useEffect } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Spinner } from '@/components/ui/spinner'
import {
  UNAUTHORIZED_EVENT,
  getConfig,
  getSession,
  login,
  logout,
} from '@/lib/inotion/api'
import type { Session } from '@/lib/inotion/types'
import { navigate } from '@/lib/inotion/route'
import { SignInScreen } from './sign-in-screen'
import { Workspace } from './workspace'

async function loadSession(): Promise<Session | null> {
  await getConfig()
  return getSession()
}

export function InotionApp() {
  const { mutate: globalMutate } = useSWRConfig()
  const session = useSWR<Session | null>('session', loadSession, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const { mutate: mutateSession } = session

  useEffect(() => {
    const onUnauthorized = () => void mutateSession(null, { revalidate: false })
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [mutateSession])

  const signIn = async (email: string, password: string) => {
    const result = await login(email, password)
    await mutateSession({ email: result?.email ?? email }, { revalidate: false })
  }

  const signOut = async () => {
    try {
      await logout()
    } finally {
      await globalMutate(() => true, undefined, { revalidate: false })
      await mutateSession(null, { revalidate: false })
      navigate({ kind: 'notes' }, { replace: true })
    }
  }

  if (session.isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading…
        </div>
      </main>
    )
  }

  if (!session.data) {
    return (
      <SignInScreen
        onSignIn={signIn}
        serverError={session.error ? (session.error as Error).message : null}
        onRetryServer={() => void mutateSession()}
      />
    )
  }

  return <Workspace email={session.data.email} onSignOut={signOut} />
}
