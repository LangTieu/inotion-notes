
import { useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/inotion/api'
import { ErrorBox } from './state-views'

interface TwoFactorStepProps {
  onVerify: (code: string) => Promise<void>
  onBack: () => void
}

type Mode = 'totp' | 'recovery'

const RECOVERY_PATTERN = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/

function verifyErrorMessage(error: unknown, mode: Mode): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return mode === 'totp'
        ? 'Invalid code. Check your authenticator app and try again.'
        : 'Invalid recovery code. Each code can only be used once.'
    }
    if (error.status === 429) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }
    return error.message
  }
  return 'Could not verify the code. Please try again.'
}

/** Second sign-in step; rendered inside the sign-in card below its header. */
export function TwoFactorStep({ onVerify, onBack }: TwoFactorStepProps) {
  const [mode, setMode] = useState<Mode>('totp')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTotp = mode === 'totp'
  const valid = isTotp ? /^\d{6}$/.test(code) : RECOVERY_PATTERN.test(code)

  const switchMode = () => {
    setMode(isTotp ? 'recovery' : 'totp')
    setCode('')
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !valid) return
    setBusy(true)
    setError(null)
    try {
      await onVerify(code)
    } catch (err) {
      setError(verifyErrorMessage(err, mode))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
      {error && <ErrorBox message={error} />}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="signin-2fa-code"
          className="text-sm font-medium text-foreground"
        >
          {isTotp ? 'Authenticator code' : 'Recovery code'}
        </label>
        {isTotp ? (
          <Input
            key="totp"
            id="signin-2fa-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="h-10 text-center font-mono text-lg tracking-[0.4em] pointer-coarse:h-11"
          />
        ) : (
          <Input
            key="recovery"
            id="signin-2fa-code"
            name="recovery-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            placeholder="XXXX-XXXX"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="h-10 text-center font-mono text-lg tracking-widest pointer-coarse:h-11"
          />
        )}
        <p className="text-xs text-muted-foreground">
          {isTotp
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of the recovery codes you saved when enabling 2FA.'}
        </p>
      </div>

      <Button
        type="submit"
        disabled={busy || !valid}
        className="h-10 bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11"
      >
        {busy && <Spinner />}
        {busy ? 'Verifying…' : 'Verify'}
      </Button>

      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={switchMode}
          disabled={busy}
          className="min-h-8 rounded-md px-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 pointer-coarse:min-h-11"
        >
          {isTotp ? 'Use a recovery code' : 'Use an authenticator code'}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="flex min-h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 pointer-coarse:min-h-11"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to sign in
        </button>
      </div>
    </form>
  )
}
