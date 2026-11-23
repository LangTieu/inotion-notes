import { useId } from 'react'

export interface OfflineCacheToggleProps {
  enabled: boolean
  onToggle: (next: boolean) => void
  busy?: boolean
  cachedCount?: number
}

export function OfflineCacheToggle({
  enabled,
  onToggle,
  busy = false,
  cachedCount,
}: OfflineCacheToggleProps) {
  const labelId = useId()
  const helpId = useId()
  const statusId = useId()

  let statusText: string | null = null
  if (busy) {
    statusText = enabled ? 'Preparing offline cache…' : 'Wiping cached data…'
  } else if (enabled && typeof cachedCount === 'number') {
    statusText = `${cachedCount} ${cachedCount === 1 ? 'note' : 'notes'} cached on this device`
  } else if (!enabled) {
    statusText = 'No notes stored on this device'
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium text-gray-900">
            Offline cache
          </p>
          <p id={helpId} className="mt-0.5 text-xs text-gray-500">
            Store notes locally for offline reading and editing. Turn off on shared devices — cached
            data is wiped immediately when disabled or on sign out.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={labelId}
          aria-describedby={`${helpId} ${statusText ? statusId : ''}`.trim()}
          aria-busy={busy}
          disabled={busy}
          onClick={() => onToggle(!enabled)}
          className="-my-2 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
              enabled ? 'border-blue-600 bg-blue-600' : 'border-gray-200 bg-gray-200'
            }`}
            aria-hidden="true"
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                enabled ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      {statusText ? (
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-1.5 border-t border-gray-200 pt-2 text-xs text-gray-500"
        >
          {busy ? (
            <svg
              className="h-3 w-3 animate-spin text-blue-600"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : null}
          {statusText}
        </p>
      ) : null}
    </div>
  )
}

export default OfflineCacheToggle
