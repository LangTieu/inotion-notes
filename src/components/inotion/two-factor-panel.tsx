
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { Check, Copy, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ApiError, disable2FA, enable2FA, setup2FA } from '@/lib/inotion/api'
import type { Session, TwoFactorSetup } from '@/lib/inotion/types'
import { QrSvg } from './qr-svg'
import { ErrorBox } from './state-views'

interface TwoFactorPanelProps {
  recoveryCodes: string[] | null
  onRecoveryCodes: (codes: string[] | null) => void
}

function describeError(error: unknown, wrongInput: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return wrongInput
    if (error.status === 429) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return { copied, copy }
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const inputClass = 'h-10 pointer-coarse:h-11'
const primaryButton =
  'bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11'

export function TwoFactorPanel({
  recoveryCodes,
  onRecoveryCodes,
}: TwoFactorPanelProps) {
  // Reads the session cached by the app shell; no fetcher is needed here.
  const { data: session, mutate: mutateSession } = useSWR<Session | null>(
    'session',
  )
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null)
  const enabled = enabledOverride ?? session?.totp_enabled ?? false

  const markEnabled = (next: boolean) => {
    setEnabledOverride(next)
    if (session) {
      void mutateSession({ ...session, totp_enabled: next }, { revalidate: false })
    }
  }

  if (recoveryCodes) {
    return (
      <RecoveryCodes codes={recoveryCodes} onDone={() => onRecoveryCodes(null)} />
    )
  }

  return enabled ? (
    <DisableForm onDisabled={() => markEnabled(false)} />
  ) : (
    <EnableFlow
      onAlreadyEnabled={() => markEnabled(true)}
      onEnabled={(codes) => {
        markEnabled(true)
        onRecoveryCodes(codes)
      }}
    />
  )
}

function EnableFlow({
  onEnabled,
  onAlreadyEnabled,
}: {
  onEnabled: (codes: string[]) => void
  onAlreadyEnabled: () => void
}) {
  const uid = useId()
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [starting, setStarting] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { copied, copy } = useCopy()

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      setSetup(await setup2FA())
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onAlreadyEnabled()
        return
      }
      setError(describeError(e, 'Your session has expired. Please sign in again.'))
    } finally {
      setStarting(false)
    }
  }

  const cancel = () => {
    setSetup(null)
    setPassword('')
    setCode('')
    setError(null)
  }

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await enable2FA({ password, code })
      onEnabled(result.recovery_codes)
    } catch (err) {
      setError(describeError(err, 'Incorrect password or authenticator code.'))
      setBusy(false)
    }
  }

  if (!setup) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Two-factor authentication is off
            </h3>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              Add a second step at sign-in using an authenticator app such as
              1Password, Authy or Google Authenticator.
            </p>
          </div>
        </div>
        {error && <ErrorBox message={error} onRetry={start} />}
        <div>
          <Button
            onClick={start}
            disabled={starting}
            className={primaryButton}
          >
            {starting && <Spinner />}
            {starting ? 'Preparing…' : 'Enable 2FA'}
          </Button>
        </div>
      </div>
    )
  }

  const groupedSecret = setup.secret_base32.match(/.{1,4}/g)?.join(' ') ?? ''

  return (
    <form onSubmit={confirm} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <QrSvg
            value={setup.otpauth_uri}
            label="QR code for your authenticator app"
            className="size-44"
          />
          <p className="text-xs text-muted-foreground">Scan with your app</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            1. Add inotion Notes to your authenticator
          </h3>
          <p className="text-sm text-pretty text-muted-foreground">
            Can&apos;t scan the code? Enter this key manually.
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
            <code
              className="min-w-0 flex-1 font-mono text-sm break-all text-foreground"
              aria-label="Manual setup key"
            >
              {groupedSecret}
            </code>
            <button
              type="button"
              onClick={() => copy(setup.secret_base32)}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-11"
              aria-label={copied ? 'Key copied' : 'Copy setup key'}
            >
              {copied ? (
                <Check className="size-4 text-green-700" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          2. Confirm it works
        </h3>
        {error && <ErrorBox message={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${uid}-password`} label="Current password">
            <Input
              id={`${uid}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id={`${uid}-code`} label="6-digit code">
            <Input
              id={`${uid}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputClass} font-mono tracking-widest`}
            />
          </Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={cancel}
            disabled={busy}
            className="pointer-coarse:h-11"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !password || code.length !== 6}
            className={primaryButton}
          >
            {busy && <Spinner />}
            {busy ? 'Enabling…' : 'Confirm & Enable'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[]
  onDone: () => void
}) {
  const { copied, copy } = useCopy()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">
            Save these codes now — they will not be shown again.
          </p>
          <p className="mt-0.5 text-pretty">
            Each code works once if you lose access to your authenticator app.
            Store them somewhere safe, like a password manager.
          </p>
        </div>
      </div>

      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-2 rounded-md border border-border bg-secondary p-3"
      >
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-md bg-card px-3 py-2 text-center font-mono text-sm tracking-wider text-foreground select-all"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => copy(codes.join('\n'))}
          className="pointer-coarse:h-11"
        >
          {copied ? (
            <Check className="text-green-700" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button type="button" onClick={onDone} className={primaryButton}>
          I have saved these codes
        </Button>
      </div>
    </div>
  )
}

function DisableForm({ onDisabled }: { onDisabled: () => void }) {
  const uid = useId()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await disable2FA({ password, code: code.trim() })
      onDisabled()
    } catch (err) {
      setError(describeError(err, 'Incorrect password or code.'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-800">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Two-factor authentication
            </h3>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Enabled
            </span>
          </div>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Sign-in requires a code from your authenticator app. To turn it off,
            confirm your password and a current code.
          </p>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${uid}-password`} label="Current password">
          <Input
            id={`${uid}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          id={`${uid}-code`}
          label="Authenticator or recovery code"
          hint="6 digits, or a recovery code like XXXX-XXXX."
        >
          <Input
            id={`${uid}-code`}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={`${inputClass} font-mono tracking-wider`}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={busy || !password || !code.trim()}
          className="bg-red-600 text-white hover:bg-red-700 pointer-coarse:h-11"
        >
          {busy && <Spinner />}
          {busy ? 'Disabling…' : 'Disable 2FA'}
        </Button>
      </div>
    </form>
  )
}
