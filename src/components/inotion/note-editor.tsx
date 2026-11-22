'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Download,
  MoreHorizontal,
  Pin,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ApiError, deleteNote, getNote, patchNote, restoreNote } from '@/lib/inotion/api'
import { flattenFolders } from '@/lib/inotion/folders'
import { formatFullDate } from '@/lib/inotion/format'
import {
  MAX_BODY,
  MAX_TITLE,
  type Folder,
  type Id,
  type Note,
  type NotePatch,
  type Tag,
} from '@/lib/inotion/types'
import { cn } from '@/lib/utils'
import { AttachmentsPanel } from './attachments-panel'
import { ConfirmDialog } from './confirm-dialog'
import { ConflictDialog } from './conflict-dialog'
import { MarkdownPreview } from './markdown-preview'
import { ErrorBox } from './state-views'
import { TagPicker } from './tag-picker'

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

export interface NoteEditorProps {
  note: Note
  folders: Folder[]
  tags: Tag[]
  onUpdated: (note: Note) => void
  onDeleted: (id: Id) => void
  onBack: () => void
  onCreateTag: (name: string) => Promise<Tag>
  onAttachmentCount: (noteId: Id, count: number) => void
  onExportAll: () => Promise<void>
}

const NO_FOLDER = '__none__'
const AUTOSAVE_MS = 1000

function SaveIndicator({
  status,
  message,
  onRetry,
}: {
  status: SaveStatus
  message: string | null
  onRetry: () => void
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      {status === 'saving' && (
        <>
          <Spinner className="size-3" /> Saving…
        </>
      )}
      {status === 'saved' && (
        <span className="flex items-center gap-1 text-success">
          <Check className="size-3.5" aria-hidden="true" /> Saved
        </span>
      )}
      {status === 'dirty' && <span>Unsaved changes</span>}
      {status === 'conflict' && (
        <span className="text-red-700">Not saved: edit conflict</span>
      )}
      {status === 'error' && (
        <span className="flex min-w-0 items-center gap-1.5 text-red-700">
          <span className="truncate">{message ?? 'Save failed'}</span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Retry
          </button>
        </span>
      )}
    </p>
  )
}

export function NoteEditor({
  note,
  folders,
  tags,
  onUpdated,
  onDeleted,
  onBack,
  onCreateTag,
  onAttachmentCount,
  onExportAll,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body_md)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef({ title: note.title, body: note.body_md })
  const savedRef = useRef({ title: note.title, body: note.body_md })
  const revisionRef = useRef(note.revision)
  const conflictRef = useRef(false)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const onUpdatedRef = useRef(onUpdated)
  onUpdatedRef.current = onUpdated

  const readOnly = !!note.trashed_at
  const isArchived = !!note.archived_at && !note.trashed_at

  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(() => fn())
    queueRef.current = run.catch(() => undefined)
    return run
  }

  const markConflict = () => {
    conflictRef.current = true
    setConflict(true)
    setStatus('conflict')
  }

  const flushContent = () =>
    enqueue(async () => {
      if (conflictRef.current || readOnly) return
      const { title: t, body: b } = draftRef.current
      const patch: NotePatch = {}
      if (t !== savedRef.current.title) patch.title = t
      if (b !== savedRef.current.body) patch.body_md = b
      if (Object.keys(patch).length === 0) return
      setStatus('saving')
      setSaveError(null)
      try {
        const updated = await patchNote(note.id, revisionRef.current, patch)
        revisionRef.current = updated.revision
        savedRef.current = { title: t, body: b }
        onUpdatedRef.current(updated)
        const same =
          draftRef.current.title === t && draftRef.current.body === b
        setStatus(same ? 'saved' : 'dirty')
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          markConflict()
        } else {
          setSaveError(e instanceof Error ? e.message : 'Save failed')
          setStatus('error')
        }
      }
    })
  flushRef.current = flushContent

  useEffect(() => {
    if (readOnly || conflict) return
    if (
      title === savedRef.current.title &&
      body === savedRef.current.body
    ) {
      return
    }
    setStatus((s) => (s === 'saving' ? s : 'dirty'))
    const timer = setTimeout(() => void flushRef.current(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [title, body, readOnly, conflict])

  // Save anything still pending when switching notes or leaving the editor.
  useEffect(() => {
    return () => {
      void flushRef.current()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void flushRef.current()
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const d = draftRef.current
      if (d.title !== savedRef.current.title || d.body !== savedRef.current.body) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const changeTitle = (value: string) => {
    draftRef.current.title = value
    setTitle(value)
  }
  const changeBody = (value: string) => {
    draftRef.current.body = value
    setBody(value)
  }

  const applyMeta = async (key: string, patch: NotePatch) => {
    setBusyAction(key)
    setActionError(null)
    void flushContent()
    try {
      const updated = await enqueue(async () => {
        if (conflictRef.current) {
          throw new Error('Resolve the edit conflict before making changes.')
        }
        return patchNote(note.id, revisionRef.current, patch)
      })
      revisionRef.current = updated.revision
      onUpdatedRef.current(updated)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) markConflict()
      else setActionError(e instanceof Error ? e.message : 'Could not update the note.')
    } finally {
      setBusyAction(null)
    }
  }

  const restore = async () => {
    setBusyAction('restore')
    setActionError(null)
    try {
      const restored = await enqueue(() => restoreNote(note.id))
      revisionRef.current = restored.revision
      onUpdatedRef.current(restored)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not restore the note.')
    } finally {
      setBusyAction(null)
    }
  }

  const reloadLatest = async () => {
    const latest = await getNote(note.id)
    draftRef.current = { title: latest.title, body: latest.body_md }
    savedRef.current = { title: latest.title, body: latest.body_md }
    revisionRef.current = latest.revision
    setTitle(latest.title)
    setBody(latest.body_md)
    conflictRef.current = false
    setConflict(false)
    setStatus('saved')
    setSaveError(null)
    onUpdatedRef.current(latest)
  }

  const overwrite = async () => {
    const latest = await getNote(note.id)
    const { title: t, body: b } = draftRef.current
    const updated = await patchNote(note.id, latest.revision, {
      title: t,
      body_md: b,
    })
    revisionRef.current = updated.revision
    savedRef.current = { title: t, body: b }
    conflictRef.current = false
    setConflict(false)
    setStatus('saved')
    onUpdatedRef.current(updated)
  }

  const exportThisNote = () => {
    const blob = new Blob([JSON.stringify(note, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(note.title.trim() || 'untitled').replace(/[^\w-]+/g, '-').slice(0, 60)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const iconBtn =
    'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-50 pointer-coarse:size-11'

  const folderOptions = flattenFolders(folders)
  const nowIso = () => new Date().toISOString()

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="box-content flex h-14 shrink-0 items-center gap-1 border-b border-border px-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to notes"
          className={cn(iconBtn, 'md:hidden')}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          {readOnly ? (
            <p className="text-xs text-muted-foreground">In Trash</p>
          ) : (
            <SaveIndicator
              status={status}
              message={saveError}
              onRetry={() => void flushContent()}
            />
          )}
        </div>

        <div
          role="group"
          aria-label="Editor mode"
          className="flex rounded-md bg-secondary p-0.5"
        >
          {(['write', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-7 rounded-[6px] px-3 text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:h-10 pointer-coarse:px-4',
                mode === m
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => applyMeta('pin', { is_pinned: !note.is_pinned })}
              disabled={!!busyAction}
              aria-pressed={note.is_pinned}
              aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'}
              className={cn(iconBtn, note.is_pinned && 'text-amber-500 hover:text-amber-500')}
            >
              <Pin
                className={cn('size-4', note.is_pinned && 'fill-amber-500')}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() =>
                applyMeta('archive', { archived_at: isArchived ? null : nowIso() })
              }
              disabled={!!busyAction}
              aria-label={isArchived ? 'Unarchive note' : 'Archive note'}
              className={iconBtn}
            >
              {isArchived ? (
                <ArchiveRestore className="size-4" aria-hidden="true" />
              ) : (
                <Archive className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => applyMeta('trash', { trashed_at: nowIso() })}
              disabled={!!busyAction}
              aria-label="Move to Trash"
              className={iconBtn}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More actions" className={iconBtn}>
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={exportThisNote}>
              <Download aria-hidden="true" /> Export note as JSON
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void onExportAll().catch((e) => setActionError(e instanceof Error ? e.message : 'Export failed.'))}>
              <Download aria-hidden="true" /> Export all notes (JSON)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {note.trashed_at && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 basis-48">
            This note is in Trash. Editing is disabled until you restore it.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={restore}
              disabled={busyAction === 'restore'}
              className="border-red-200 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 pointer-coarse:h-11"
            >
              {busyAction === 'restore' ? <Spinner /> : <RotateCcw aria-hidden="true" />}
              Restore
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="bg-red-600 text-white hover:bg-red-700 pointer-coarse:h-11"
            >
              Delete Permanently
            </Button>
          </div>
        </div>
      )}

      {isArchived && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-secondary px-4 py-2 text-sm text-muted-foreground"
        >
          <Archive className="size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 basis-48">This note is archived.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={restore}
            disabled={busyAction === 'restore'}
            className="pointer-coarse:h-11"
          >
            {busyAction === 'restore' ? <Spinner /> : <ArchiveRestore aria-hidden="true" />}
            Restore to All Notes
          </Button>
        </div>
      )}

      {actionError && (
        <div className="shrink-0 px-4 pt-3">
          <ErrorBox message={actionError} />
        </div>
      )}

      <div className="shrink-0 space-y-2 px-4 pt-4 pb-2 md:px-8">
        <input
          value={title}
          onChange={(e) => changeTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              setMode('write')
              bodyRef.current?.focus()
            }
          }}
          readOnly={readOnly}
          maxLength={MAX_TITLE}
          placeholder="Title"
          aria-label="Note title"
          className="w-full bg-transparent text-2xl font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none read-only:cursor-default"
        />
        {title.length > MAX_TITLE - 50 && (
          <p className="text-xs text-muted-foreground">
            {title.length} / {MAX_TITLE}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Select
            value={note.folder_id != null ? String(note.folder_id) : NO_FOLDER}
            onValueChange={(v) =>
              applyMeta('folder', {
                folder_id:
                  v === NO_FOLDER
                    ? null
                    : (folders.find((f) => String(f.id) === v)?.id ?? v),
              })
            }
            disabled={readOnly || !!busyAction}
          >
            <SelectTrigger
              size="sm"
              aria-label="Folder"
              className="h-7 w-auto max-w-48 gap-1.5 border-none bg-secondary px-2.5 text-xs shadow-none pointer-coarse:h-11"
            >
              <SelectValue placeholder="No folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FOLDER}>No folder</SelectItem>
              {folderOptions.map((n) => (
                <SelectItem
                  key={String(n.folder.id)}
                  value={String(n.folder.id)}
                  style={{ paddingLeft: 8 + n.depth * 14 }}
                >
                  {n.folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TagPicker
            selected={note.tags}
            allTags={tags}
            disabled={readOnly || !!busyAction}
            onChange={(ids) => void applyMeta('tags', { tag_ids: ids })}
            onCreate={onCreateTag}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Edited {formatFullDate(note.updated_at)}
        </p>
      </div>

      <div className="min-h-0 flex-1 border-t border-border">
        {mode === 'write' ? (
          <div className="flex h-full flex-col">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => changeBody(e.target.value)}
              readOnly={readOnly}
              maxLength={MAX_BODY}
              placeholder={readOnly ? '' : 'Start writing in Markdown…'}
              aria-label="Note body (Markdown)"
              spellCheck
              className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-4 text-[15px] leading-7 text-foreground placeholder:text-muted-foreground/70 focus:outline-none md:px-8"
            />
            {body.length > MAX_BODY - 5000 && (
              <p className="px-4 pb-2 text-xs text-muted-foreground md:px-8">
                {body.length.toLocaleString('en-US')} / {MAX_BODY.toLocaleString('en-US')} characters
              </p>
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-4 py-4 md:px-8">
            <MarkdownPreview source={body} />
          </div>
        )}
      </div>

      <AttachmentsPanel
        noteId={note.id}
        readOnly={readOnly}
        onCountChange={onAttachmentCount}
      />

      <ConflictDialog open={conflict} onReload={reloadLatest} onOverwrite={overwrite} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note permanently?"
        description={
          <p>
            <TriangleAlert className="mr-1 inline size-4 -translate-y-px text-red-600" aria-hidden="true" />
            This note and all of its attachments will be permanently deleted. This
            cannot be undone.
          </p>
        }
        confirmLabel="Delete Permanently"
        busyLabel="Deleting…"
        onConfirm={async () => {
          await deleteNote(note.id)
          onDeleted(note.id)
        }}
      />
    </div>
  )
}
