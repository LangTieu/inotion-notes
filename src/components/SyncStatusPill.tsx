export type SyncStatus = 'offline' | 'syncing' | 'synced'

export interface SyncStatusPillProps {
  status: SyncStatus
  unsyncedCount: number
  onRetry?: () => void
}

const baseClasses =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium sm:min-h-8'

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin text-blue-600"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function SyncStatusPill({ status, unsyncedCount, onRetry }: SyncStatusPillProps) {
  if (status === 'offline') {
    const content = (
      <>
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        <span>{`Offline · ${unsyncedCount} unsynced`}</span>
      </>
    )

    if (onRetry) {
      return (
        <button
          type="button"
          onClick={onRetry}
          title="Retry sync"
          aria-label={`Offline, ${unsyncedCount} unsynced. Retry sync`}
          className={`${baseClasses} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
        >
          {content}
        </button>
      )
    }

    return (
      <span
        role="status"
        className={`${baseClasses} border-amber-200 bg-amber-50 text-amber-800`}
      >
        {content}
      </span>
    )
  }

  if (status === 'syncing') {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`${baseClasses} border-gray-200 bg-white text-gray-500`}
      >
        <Spinner />
        <span>Syncing…</span>
      </span>
    )
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={`${baseClasses} border-gray-200 bg-white text-gray-500`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" aria-hidden="true" />
      <span>All synced</span>
    </span>
  )
}

export default SyncStatusPill
