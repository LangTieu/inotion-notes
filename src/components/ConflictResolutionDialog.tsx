import { useEffect, useId, useRef } from 'react'

export interface ConflictResolutionDialogProps {
  open: boolean
  noteTitle: string
  localUpdatedAt: number
  serverUpdatedAt: number
  localPreview?: string
  serverPreview?: string
  resolving?: boolean
  error?: string | null
  onReloadLatest: () => void
  onOverwrite: () => void
  onClose?: () => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})

function formatTimestamp(value: number) {
  return Number.isFinite(value) ? dateFormatter.format(new Date(value)) : 'Unknown'
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

interface VersionPanelProps {
  label: string
  timestamp: number
  preview?: string
  highlight?: boolean
}

function VersionPanel({ label, timestamp, preview, highlight }: VersionPanelProps) {
  return (
    <div
      className={`min-w-0 rounded-md border p-3 ${
        highlight ? 'border-blue-600/30 bg-white' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{formatTimestamp(timestamp)}</p>
      {preview ? (
        <p className="mt-2 line-clamp-3 break-words text-xs text-gray-500">{preview}</p>
      ) : null}
    </div>
  )
}

export function ConflictResolutionDialog({
  open,
  noteTitle,
  localUpdatedAt,
  serverUpdatedAt,
  localPreview,
  serverPreview,
  resolving = false,
  error = null,
  onReloadLatest,
  onOverwrite,
  onClose,
}: ConflictResolutionDialogProps) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    firstButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !resolving && onClose) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, resolving, onClose])

  if (!open) return null

  const serverIsNewer = serverUpdatedAt > localUpdatedAt

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !resolving) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={resolving}
        className="w-full max-w-md rounded-t-md border border-gray-200 bg-white shadow-lg sm:rounded-md"
      >
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 7v6M12 17h.01" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-gray-900">
                Revision conflict
              </h2>
              <p id={descId} className="mt-0.5 text-xs text-gray-500">
                <span className="font-medium text-gray-900 break-words">
                  {noteTitle || 'Untitled'}
                </span>{' '}
                was changed elsewhere while you were editing. Choose which version to keep.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 bg-gray-50 px-4 py-3 sm:grid-cols-2">
          <VersionPanel label="Your draft" timestamp={localUpdatedAt} preview={localPreview} />
          <VersionPanel
            label={serverIsNewer ? 'Server (newer)' : 'Server version'}
            timestamp={serverUpdatedAt}
            preview={serverPreview}
            highlight={serverIsNewer}
          />
        </div>

        {error ? (
          <div
            role="alert"
            className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:justify-end">
          <button
            ref={firstButtonRef}
            type="button"
            onClick={onReloadLatest}
            disabled={resolving}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
          >
            Reload latest
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            disabled={resolving}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
          >
            {resolving ? <Spinner /> : null}
            {resolving ? 'Resolving…' : 'Overwrite'}
          </button>
        </div>

        <p className="px-4 pb-3 text-xs text-gray-500">
          Reload latest discards your draft. Overwrite replaces the server version with your draft.
        </p>
      </div>
    </div>
  )
}

export default ConflictResolutionDialog
