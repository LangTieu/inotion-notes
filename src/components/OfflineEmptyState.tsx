export interface OfflineEmptyStateProps {
  cachedNoteCount: number
  unsyncedCount: number
  onRetry?: () => void
}

export function OfflineEmptyState({ cachedNoteCount, unsyncedCount, onRetry }: OfflineEmptyStateProps) {
  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center bg-gray-50 p-6">
      <div
        role="status"
        className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-5 text-center"
      >
        <span
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-800"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 2l20 20" />
            <path d="M8.5 16.4a5 5 0 0 1 7 0" />
            <path d="M5 12.9a10 10 0 0 1 5.2-2.7" />
            <path d="M19 12.9a10 10 0 0 0-2.4-1.9" />
            <path d="M2 8.8a15 15 0 0 1 4.2-2.5" />
            <path d="M22 8.8a15 15 0 0 0-8.4-3.7" />
            <path d="M12 20h.01" />
          </svg>
        </span>

        <h2 className="mt-3 text-sm font-semibold text-gray-900">You&apos;re offline</h2>
        <p className="mt-1 text-xs text-gray-500">
          {cachedNoteCount > 0
            ? `${cachedNoteCount} cached ${cachedNoteCount === 1 ? 'note is' : 'notes are'} still readable and editable. Changes are queued and sync when you reconnect.`
            : 'No notes are cached on this device. Reconnect to load your notes.'}
        </p>

        <ul className="mt-3 space-y-1.5 text-left text-xs text-gray-500">
          <li className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span>
              <span className="font-medium text-gray-900">{unsyncedCount} unsynced</span>{' '}
              {unsyncedCount === 1 ? 'change' : 'changes'} waiting to sync.
            </span>
          </li>
          <li className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" aria-hidden="true" />
            <span>Attachments require an online connection.</span>
          </li>
        </ul>

        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-h-9 sm:w-auto"
          >
            Retry connection
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default OfflineEmptyState
