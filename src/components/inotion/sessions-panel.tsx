
import { useState } from 'react'
import useSWR from 'swr'
import { Laptop, MonitorSmartphone, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from '@/lib/inotion/api'
import type { AuthSession } from '@/lib/inotion/types'
import { BlockError, EmptyState, ErrorBox } from './state-views'

const SESSIONS_KEY = 'auth-sessions'

/** Backend timestamps may be Unix seconds or milliseconds. */
function toDate(value: number): Date {
  return new Date(value < 1e12 ? value * 1000 : value)
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTime(value: number): string {
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date)
}

function describeUserAgent(ua: string | null): {
  label: string
  mobile: boolean
} {
  if (!ua) return { label: 'Unknown device', mobile: false }
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux|X11/.test(ua)
            ? 'Linux'
            : null
  const mobile = /iPhone|iPad|iPod|Android|Mobile/.test(ua)
  if (browser && os) return { label: `${browser} on ${os}`, mobile }
  return { label: browser ?? os ?? ua.slice(0, 40), mobile }
}

function SessionsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sessions"
      className="divide-y divide-border rounded-md border border-border"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SessionsPanel() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    AuthSession[]
  >(SESSIONS_KEY, listSessions, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [revokingAll, setRevokingAll] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const sessions = data ?? []
  const others = sessions.filter((s) => !s.is_current)

  const revokeOne = async (id: string) => {
    setPendingId(id)
    setActionError(null)
    try {
      await revokeSession(id)
      await mutate()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not revoke session.')
    } finally {
      setPendingId(null)
    }
  }

  const revokeAll = async () => {
    setRevokingAll(true)
    setActionError(null)
    try {
      await revokeOtherSessions()
      setConfirmingAll(false)
      await mutate()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not revoke sessions.')
    } finally {
      setRevokingAll(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Devices currently signed in to your notebook.
        </p>
        {confirmingAll ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingAll(false)}
              disabled={revokingAll}
              className="pointer-coarse:h-11"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={revokeAll}
              disabled={revokingAll}
              className="bg-red-600 text-white hover:bg-red-700 pointer-coarse:h-11"
            >
              {revokingAll && <Spinner />}
              {revokingAll ? 'Revoking…' : `Revoke ${others.length} other`}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmingAll(true)}
            disabled={others.length === 0}
            className="pointer-coarse:h-11"
          >
            Revoke all other sessions
          </Button>
        )}
      </div>

      {confirmingAll && (
        <p className="text-sm text-muted-foreground" role="status">
          This signs out every device except this one. Are you sure?
        </p>
      )}
      {actionError && <ErrorBox message={actionError} />}

      {isLoading ? (
        <SessionsSkeleton />
      ) : error ? (
        <div className="rounded-md border border-border">
          <BlockError
            title="Couldn't load sessions"
            message={error instanceof Error ? error.message : 'Please try again.'}
            onRetry={() => void mutate()}
          />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-md border border-border">
          <EmptyState
            icon={<Laptop aria-hidden="true" />}
            title="No active sessions"
            description="Sessions will appear here when you sign in."
          />
        </div>
      ) : (
        <ul
          aria-label="Active sessions"
          aria-busy={isValidating}
          className="divide-y divide-border rounded-md border border-border"
        >
          {sessions.map((session) => {
            const device = describeUserAgent(session.user_agent)
            const Icon = device.mobile ? Smartphone : MonitorSmartphone
            return (
              <li
                key={session.session_id}
                className="flex items-start gap-3 px-3 py-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={session.user_agent ?? undefined}
                    >
                      {device.label}
                    </p>
                    {session.is_current && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Current
                      </span>
                    )}
                  </div>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <dt>Signed in</dt>
                    <dd>{formatTime(session.created_at)}</dd>
                    <dt>Last active</dt>
                    <dd>{formatTime(session.last_seen_at)}</dd>
                    <dt>Expires</dt>
                    <dd>{formatTime(session.expires_at)}</dd>
                  </dl>
                </div>
                {!session.is_current && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => revokeOne(session.session_id)}
                    disabled={pendingId !== null || revokingAll}
                    aria-label={`Revoke session on ${device.label}`}
                    className="shrink-0 text-red-700 hover:text-red-700 pointer-coarse:h-11"
                  >
                    {pendingId === session.session_id && <Spinner />}
                    Revoke
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
