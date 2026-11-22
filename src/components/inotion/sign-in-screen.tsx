
import { useState, type FormEvent } from 'react'
import { NotebookPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/inotion/api'
import type { TwoFactorChallenge } from '@/lib/inotion/types'
import { ErrorBox } from './state-views'
import { TwoFactorStep } from './two-factor-step'

interface SignInScreenProps {
  /** Resolves with a challenge when the account requires a 2FA code. */
  onSignIn: (
    email: string,
    password: string,
  ) => Promise<TwoFactorChallenge | void>
  onVerify: (challengeToken: string, code: string) => Promise<void>
  /** Shown when the server could not be reached at startup. */
  serverError?: string | null
  onRetryServer?: () => void
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Incorrect email or password.'
      case 403:
        return 'This account is not allowed to sign in.'
      case 429:
        return 'Too many attempts. Please wait a few minutes and try again.'
      default:
        return error.message
    }
  }
  return 'Could not sign in. Please try again.'
}

export function SignInScreen({
  onSignIn,
  onVerify,
  serverError,
  onRetryServer,
}: SignInScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)

  const backToSignIn = () => {
    setChallengeToken(null)
    setPassword('')
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await onSignIn(email.trim(), password)
      if (result && result.challenge_token) {
        setChallengeToken(result.challenge_token)
        setBusy(false)
      }
    } catch (err) {
      setError(loginErrorMessage(err))
      setBusy(false)
    }
  }

  const message = error ?? serverError ?? null

  return (
    <main className="flex min-h-dvh items-center justify-center bg-linear-to-b from-background via-secondary to-border/70 px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <NotebookPen className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-balance text-foreground">
              {challengeToken ? 'Two-Factor Authentication' : 'inotion Notes'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {challengeToken
                ? 'Confirm it’s you to finish signing in'
                : 'Sign in to your private notebook'}
            </p>
          </div>
        </div>

        {challengeToken ? (
          <TwoFactorStep
            onVerify={(code) => onVerify(challengeToken, code)}
            onBack={backToSignIn}
          />
        ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          {message && (
            <ErrorBox
              message={message}
              onRetry={!error && serverError ? onRetryServer : undefined}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signin-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="signin-email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 pointer-coarse:h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signin-password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <Input
              id="signin-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 pointer-coarse:h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !email || !password}
            className="h-10 bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11"
          >
            {busy && <Spinner />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        )}
      </div>
    </main>
  )
}
