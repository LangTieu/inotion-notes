import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { NoteRevisionDetail, NoteRevisionMeta } from '@/lib/inotion/types'

export interface RevisionHistoryDrawerProps {
  open: boolean
  onClose: () => void
  noteId: string
  currentTitle: string
  currentBodyMd: string
  currentRevision: number
  onLoadRevisions: (noteId: string) => Promise<NoteRevisionMeta[]>
  onLoadRevisionDetail: (
    noteId: string,
    revId: string,
  ) => Promise<NoteRevisionDetail>
  onRestore: (
    noteId: string,
    revId: string,
    currentRevision: number,
  ) => Promise<void>
  onSaveSnapshot: () => Promise<void>
}

/* ---------- Zero-dependency line diff ---------- */

type DiffOp = { type: 'same' | 'add' | 'remove'; text: string }
type DiffRow = DiffOp | { type: 'gap'; count: number }

const MAX_LCS_CELLS = 2_000_000
const CONTEXT_LINES = 2

function diffLines(base: string, target: string): DiffOp[] {
  const a = base.split('\n')
  const b = target.split('\n')

  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++
  }
  let endA = a.length
  let endB = b.length
  while (endA > prefix && endB > prefix && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const midA = a.slice(prefix, endA)
  const midB = b.slice(prefix, endB)
  const ops: DiffOp[] = a
    .slice(0, prefix)
    .map((text) => ({ type: 'same', text }))

  if (midA.length * midB.length > MAX_LCS_CELLS) {
    for (const text of midA) ops.push({ type: 'remove', text })
    for (const text of midB) ops.push({ type: 'add', text })
  } else {
    const n = midA.length
    const m = midB.length
    const width = m + 1
    const lcs = new Uint32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * width + j] =
          midA[i] === midB[j]
            ? lcs[(i + 1) * width + j + 1] + 1
            : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ type: 'same', text: midA[i] })
        i++
        j++
      } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
        ops.push({ type: 'remove', text: midA[i++] })
      } else {
        ops.push({ type: 'add', text: midB[j++] })
      }
    }
    while (i < n) ops.push({ type: 'remove', text: midA[i++] })
    while (j < m) ops.push({ type: 'add', text: midB[j++] })
  }

  for (const text of a.slice(endA)) ops.push({ type: 'same', text })
  return ops
}

function collapseUnchanged(ops: DiffOp[]): DiffRow[] {
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((op, i) => {
    if (op.type === 'same') return
    for (let k = i - CONTEXT_LINES; k <= i + CONTEXT_LINES; k++) {
      if (k >= 0 && k < ops.length) keep[k] = true
    }
  })

  const rows: DiffRow[] = []
  let hidden = 0
  ops.forEach((op, i) => {
    if (keep[i]) {
      if (hidden > 0) {
        rows.push({ type: 'gap', count: hidden })
        hidden = 0
      }
      rows.push(op)
    } else {
      hidden++
    }
  })
  if (hidden > 0) rows.push({ type: 'gap', count: hidden })
  return rows
}

/* ---------- Formatting + errors ---------- */

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return String(timestamp)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function describeError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (status === 409 || /\b409\b|conflict/i.test(message)) {
    return 'Conflict (409): this note changed since you opened it, so nothing was overwritten. Reload the note to get the latest version, then try again.'
  }
  return message || 'Something went wrong. Please try again.'
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* ---------- Component ---------- */

export function RevisionHistoryDrawer({
  open,
  onClose,
  noteId,
  currentTitle,
  currentBodyMd,
  currentRevision,
  onLoadRevisions,
  onLoadRevisionDetail,
  onRestore,
  onSaveSnapshot,
}: RevisionHistoryDrawerProps) {
  const [revisions, setRevisions] = useState<NoteRevisionMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] =
    useState<NoteRevisionDetail | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const loadRevisionsRef = useRef(onLoadRevisions)
  const loadDetailRef = useRef(onLoadRevisionDetail)
  useEffect(() => {
    loadRevisionsRef.current = onLoadRevisions
    loadDetailRef.current = onLoadRevisionDetail
  })

  // Reset when closed or when switching notes.
  useEffect(() => {
    if (open) return
    setRevisions([])
    setSelectedId(null)
    setSelectedDetail(null)
    setError(null)
  }, [open, noteId])

  // Load list (open, note change, revision change, or manual reload).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingList(true)
    setError(null)
    loadRevisionsRef
      .current(noteId)
      .then((list) => {
        if (cancelled) return
        const sorted = [...list]
          .sort((x, y) => y.revision - x.revision)
          .slice(0, 30)
        setRevisions(sorted)
        setSelectedId((prev) =>
          prev && sorted.some((r) => r.id === prev) ? prev : (sorted[0]?.id ?? null),
        )
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, noteId, currentRevision, reloadTick])

  // Load detail for the selected revision.
  useEffect(() => {
    if (!open || !selectedId) {
      setSelectedDetail(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    setSelectedDetail(null)
    loadDetailRef
      .current(noteId, selectedId)
      .then((detail) => {
        if (!cancelled) setSelectedDetail(detail)
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, noteId, selectedId])

  // Focus management + scroll lock.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
  }, [open])

  const rows = useMemo(
    () =>
      selectedDetail
        ? collapseUnchanged(diffLines(currentBodyMd, selectedDetail.body_md))
        : [],
    [selectedDetail, currentBodyMd],
  )
  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const r of rows) {
      if (r.type === 'add') added++
      else if (r.type === 'remove') removed++
    }
    return { added, removed }
  }, [rows])

  if (!open) return null

  const titleChanged =
    selectedDetail !== null && selectedDetail.title !== currentTitle
  const identical =
    selectedDetail !== null &&
    !titleChanged &&
    selectedDetail.body_md === currentBodyMd
  const busy = restoring || savingSnapshot

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!nodes || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const handleSaveSnapshot = async () => {
    if (busy) return
    setSavingSnapshot(true)
    setError(null)
    try {
      await onSaveSnapshot()
      setReloadTick((t) => t + 1)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSavingSnapshot(false)
    }
  }

  const handleRestore = async () => {
    if (!selectedDetail || busy) return
    setRestoring(true)
    setError(null)
    try {
      await onRestore(noteId, selectedDetail.id, currentRevision)
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-gray-900/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-history-title"
        className="relative flex h-full w-full flex-col bg-white text-gray-900 shadow-xl sm:max-w-3xl lg:max-w-4xl"
      >
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
          <h2
            id="revision-history-title"
            className="min-w-0 flex-1 truncate text-base font-semibold"
          >
            Revision History
          </h2>
          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50"
          >
            {savingSnapshot ? 'Saving…' : 'Save snapshot'}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close revision history"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Revisions"
            className="max-h-[40%] shrink-0 overflow-y-auto border-b border-gray-200 md:max-h-none md:w-72 md:border-b-0 md:border-r"
          >
            {loadingList && revisions.length === 0 ? (
              <p role="status" className="animate-pulse p-4 text-sm text-gray-500">
                Loading revisions…
              </p>
            ) : revisions.length === 0 ? (
              !error && (
                <p className="p-4 text-sm text-gray-500">
                  No revisions yet. Use “Save snapshot” to capture the current
                  version.
                </p>
              )
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {revisions.map((rev) => {
                  const selected = rev.id === selectedId
                  return (
                    <li key={rev.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(rev.id)}
                        disabled={restoring}
                        aria-current={selected ? 'true' : undefined}
                        className={`flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          selected
                            ? 'bg-blue-50 ring-1 ring-inset ring-blue-600'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="font-semibold">
                            r{rev.revision}
                            {rev.revision === currentRevision && (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                current
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-gray-500">
                            {formatBytes(rev.byte_length)}
                          </span>
                        </span>
                        <span className="w-full truncate text-gray-900">
                          {rev.title || 'Untitled'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(rev.created_at)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </nav>

          <section
            aria-label="Revision changes"
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {loadingDetail ? (
              <p role="status" className="animate-pulse text-sm text-gray-500">
                Loading revision…
              </p>
            ) : !selectedDetail ? (
              <p className="text-sm text-gray-500">
                {revisions.length > 0
                  ? 'Select a revision to compare it with the current version.'
                  : ''}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-500">
                  Restoring r{selectedDetail.revision} will{' '}
                  <span className="text-red-700">remove red lines</span> and{' '}
                  <span className="text-green-700">add green lines</span>
                  {!identical && (
                    <>
                      {' '}
                      ({stats.added} added, {stats.removed} removed)
                    </>
                  )}
                  .
                </p>

                {titleChanged && (
                  <div className="overflow-hidden rounded-md border border-gray-200 font-mono text-xs">
                    <div className="whitespace-pre-wrap break-words bg-red-50 px-3 py-1 text-red-700">
                      {'− '}
                      {currentTitle || 'Untitled'}
                    </div>
                    <div className="whitespace-pre-wrap break-words bg-green-50 px-3 py-1 text-green-700">
                      {'+ '}
                      {selectedDetail.title || 'Untitled'}
                    </div>
                  </div>
                )}

                {identical ? (
                  <p className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500">
                    This revision is identical to the current version.
                  </p>
                ) : (
                  <div
                    className="overflow-x-auto rounded-md border border-gray-200 font-mono text-xs leading-relaxed"
                    role="group"
                    aria-label="Line diff"
                  >
                    {rows.map((row, i) => {
                      if (row.type === 'gap') {
                        return (
                          <div
                            key={i}
                            className="bg-gray-50 px-3 py-1 text-center text-gray-500"
                          >
                            {row.count} unchanged {row.count === 1 ? 'line' : 'lines'}
                          </div>
                        )
                      }
                      const style =
                        row.type === 'add'
                          ? 'bg-green-50 text-green-700'
                          : row.type === 'remove'
                            ? 'bg-red-50 text-red-700'
                            : 'text-gray-500'
                      const sign =
                        row.type === 'add' ? '+' : row.type === 'remove' ? '−' : ' '
                      return (
                        <div key={i} className={`flex ${style}`}>
                          <span
                            aria-hidden="true"
                            className="w-6 shrink-0 select-none text-center"
                          >
                            {sign}
                          </span>
                          <span className="sr-only">
                            {row.type === 'add'
                              ? 'Added: '
                              : row.type === 'remove'
                                ? 'Removed: '
                                : 'Unchanged: '}
                          </span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3">
                            {row.text === '' ? '\u00A0' : row.text}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={handleRestore}
            disabled={!selectedDetail || identical || busy}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            {restoring ? 'Restoring…' : 'Restore this revision'}
          </button>
        </footer>
      </div>
    </div>
  )
}

export default RevisionHistoryDrawer
