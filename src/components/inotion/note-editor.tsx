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
  Share2,
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
import { ApiError, createNoteShare, deleteNote, getNote, getNoteRevision, listNoteRevisions, patchNote, restoreNote, restoreNoteRevision } from '@/lib/inotion/api'
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
import { ConflictResolutionDialog } from '../ConflictResolutionDialog'
import { resolveConflict } from '@/offline/syncEngine'
import { ErrorBox } from './state-views'
import { TagPicker } from './tag-picker'
import { MarkdownPreview } from './markdown-preview'
import { RichMarkdownEditor } from '../RichMarkdownEditor'
import { RevisionHistoryDrawer } from '../RevisionHistoryDrawer'
import { exportNote } from '@/utils/exportFormats'
import { ShareButton } from '@/components/share-button'
import { listNoteShares, revokeNoteShare } from '@/lib/inotion/api'
import { ReminderPopover } from '@/components/reminder-popover'

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
  const [focusMode, setFocusMode] = useState(false)
  const [historyOpen,setHistoryOpen]=useState(false)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [conflictResolving, setConflictResolving] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [shareRecords, setShareRecords] = useState<{id:string;url:string;createdAt:number;expiresAt:number|null}[]>([])
  const [shareLoading, setShareLoading] = useState(false)

  const loadShares = async () => {
    setShareLoading(true)
    try { const rows=await listNoteShares(note.id);setShareRecords(rows.filter(row=>!row.revoked_at).map(row=>({id:row.id,url:sessionStorage.getItem(`inotion-share:${row.id}`) || `${location.origin}/s/${row.id}`,createdAt:row.created_at,expiresAt:row.expires_at}))) }
    finally { setShareLoading(false) }
  }
  const createShareFromModal = async (expiry: '24h'|'7d'|'30d'|'never') => {
    await flushRef.current()
    const durations:Record<string,number>={'24h':86400000,'7d':604800000,'30d':2592000000}
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12))
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({title:draftRef.current.title,body_md:draftRef.current.body})))
    const b64=(data:Uint8Array)=>btoa(String.fromCharCode(...data)),raw=new Uint8Array(await crypto.subtle.exportKey('raw',key))
    const created=await createNoteShare(note.id,{ciphertext_b64:b64(new Uint8Array(encrypted)),iv_b64:b64(iv),expires_at:expiry==='never'?null:Date.now()+durations[expiry]})
    const url=`${location.origin}/s/${created.id}#${b64(raw)}`
    sessionStorage.setItem(`inotion-share:${created.id}`,url)
    setShareRecords(current=>[{id:created.id,url,createdAt:created.created_at,expiresAt:created.expires_at},...current])
    await navigator.clipboard.writeText(url)
  }

  const createShareLink = async () => {
    try {
      await flushRef.current()
      const duration=window.prompt('Link expires in: 24h, 7d, 30d, or never','7d')?.trim().toLowerCase()
      if(!duration)return
      const ms:Record<string,number>={'24h':86400000,'7d':604800000,'30d':2592000000}
      if(duration!=='never'&&!ms[duration])throw new Error('Choose 24h, 7d, 30d, or never.')
      const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12))
      const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({title:draftRef.current.title,body_md:draftRef.current.body})))
      const b64=(data:Uint8Array)=>btoa(String.fromCharCode(...data))
      const raw=new Uint8Array(await crypto.subtle.exportKey('raw',key)),cipher=new Uint8Array(bytes)
      const created=await createNoteShare(note.id,{ciphertext_b64:b64(cipher),iv_b64:b64(iv),expires_at:duration==='never'?null:Date.now()+ms[duration]})
      const link=`${location.origin}/s/${created.id}#${b64(raw)}`
      await navigator.clipboard.writeText(link);setActionError('Encrypted share link copied to clipboard.')
    } catch(e) {setActionError(e instanceof Error?e.message:'Could not create share link.')}
  }

  const draftRef = useRef({ title: note.title, body: note.body_md })
  const savedRef = useRef({ title: note.title, body: note.body_md })
  const revisionRef = useRef(note.revision)
  const conflictRef = useRef(false)
  const offlineConflictId = useRef<string | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const onUpdatedRef = useRef(onUpdated)
  onUpdatedRef.current = onUpdated

  useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<{noteId:string;outboxId:string}>).detail;if(String(detail.noteId)===String(note.id)){offlineConflictId.current=detail.outboxId;markConflict()}};window.addEventListener('inotion:offline-conflict',receive);return()=>window.removeEventListener('inotion:offline-conflict',receive)},[note.id])

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
    if(offlineConflictId.current){await resolveConflict(offlineConflictId.current,'reload',latest);offlineConflictId.current=null}
  }

  const overwrite = async () => {
    const latest = await getNote(note.id)
    const { title: t, body: b } = draftRef.current
    const updated = await patchNote(note.id, latest.revision, {
      title: t,
      body_md: b,
      force_snapshot: true,
    })
    revisionRef.current = updated.revision
    savedRef.current = { title: t, body: b }
    conflictRef.current = false
    setConflict(false)
    setStatus('saved')
    onUpdatedRef.current(updated)
    if(offlineConflictId.current){await resolveConflict(offlineConflictId.current,'overwrite',updated);offlineConflictId.current=null}
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

        {!readOnly && (
          <>
            <ShareButton noteTitle={title} links={shareRecords} isLoading={shareLoading} onOpen={() => { void loadShares() }} onCreate={createShareFromModal} onRevoke={async id => { await revokeNoteShare(id);setShareRecords(current=>current.filter(link=>link.id!==id)) }} />
            <ReminderPopover variant="toolbar" reminderAt={note.reminder_at} onChange={value => { void (async () => { try { const updated = await patchNote(note.id, revisionRef.current, { reminder_at: value }); revisionRef.current = updated.revision; onUpdatedRef.current(updated) } catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not update reminder.') } })() }} />
            <button type="button" onClick={()=>setHistoryOpen(true)} className="rounded border px-2 py-1 text-xs">History</button>
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
            {!note.trashed_at && <DropdownMenuItem onSelect={() => void createShareLink()}><Share2 aria-hidden="true" /> Create encrypted share link</DropdownMenuItem>}
            <DropdownMenuItem onSelect={exportThisNote}>
              <Download aria-hidden="true" /> Export note as JSON
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportNote(note,'md',folders.find(f=>String(f.id)===String(note.folder_id))?.name)}><Download aria-hidden="true" /> Export Markdown</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportNote(note,'html')}><Download aria-hidden="true" /> Export HTML</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportNote(note,'pdf')}><Download aria-hidden="true" /> Print / PDF</DropdownMenuItem>
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

      <div className={cn('min-h-0 flex-1 border-t border-border', focusMode && 'fixed inset-0 z-40 flex flex-col border-0 bg-background')}>
        <div className="h-full min-h-0">
            <RichMarkdownEditor value={body} onChange={changeBody} disabled={readOnly} focusMode={focusMode} onToggleFocusMode={()=>setFocusMode(value=>!value)} renderPreview={(md,onToggleCheckbox)=><MarkdownPreview source={md} onToggleTask={readOnly?undefined:(line)=>onToggleCheckbox(line)}/>}/>
            {body.length > MAX_BODY - 5000 && (
              <p className="px-4 pb-2 text-xs text-muted-foreground md:px-8">
                {body.length.toLocaleString('en-US')} / {MAX_BODY.toLocaleString('en-US')} characters
              </p>
            )}
        </div>
      </div>

      <AttachmentsPanel
        noteId={note.id}
        readOnly={readOnly}
        onCountChange={onAttachmentCount}
      />

      <RevisionHistoryDrawer open={historyOpen} onClose={()=>setHistoryOpen(false)} noteId={String(note.id)} currentTitle={title} currentBodyMd={body} currentRevision={revisionRef.current} onLoadRevisions={id=>listNoteRevisions(id)} onLoadRevisionDetail={(id,revId)=>getNoteRevision(id,revId)} onRestore={async(id,revId,currentRevision)=>{await flushContent();const updated=await restoreNoteRevision(id,revId,currentRevision);revisionRef.current=updated.revision;savedRef.current={title:updated.title,body:updated.body_md};draftRef.current={title:updated.title,body:updated.body_md};setTitle(updated.title);setBody(updated.body_md);onUpdatedRef.current(updated)}} onSaveSnapshot={async()=>{await flushContent();const latest=await getNote(note.id);const snap=await patchNote(note.id,latest.revision,{force_snapshot:true});revisionRef.current=snap.revision;onUpdatedRef.current(snap)}} />

      <ConflictResolutionDialog open={conflict} noteTitle={title} localUpdatedAt={Date.parse(note.updated_at)} serverUpdatedAt={Date.parse(note.updated_at)} localPreview={body} resolving={conflictResolving} error={conflictError} onReloadLatest={() => { setConflictResolving(true); setConflictError(null); void reloadLatest().catch(e => setConflictError(e instanceof Error ? e.message : 'Could not reload the latest version.')).finally(() => setConflictResolving(false)) }} onOverwrite={() => { setConflictResolving(true); setConflictError(null); void overwrite().catch(e => setConflictError(e instanceof Error ? e.message : 'Could not overwrite the server version.')).finally(() => setConflictResolving(false)) }} />

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
