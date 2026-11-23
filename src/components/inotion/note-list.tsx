'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  Archive,
  FileText,
  Menu,
  Paperclip,
  Pin,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatListTime, sameId, snippetFromMarkdown } from '@/lib/inotion/format'
import type { Route } from '@/lib/inotion/route'
import type { Note } from '@/lib/inotion/types'
import { cn } from '@/lib/utils'
import { BlockError, EmptyState, ListSkeleton } from './state-views'
import { syncNow } from '@/offline/syncEngine'
import { all as getOfflineRows } from '@/offline/db'
import { SyncStatusPill } from '../SyncStatusPill'

interface ToolbarProps {
  title: string
  subtitle?: string
  isRefreshing: boolean
  creating: boolean
  canCreate: boolean
  onOpenDrawer: () => void
  onSearch: () => void
  onRefresh: () => void
  onNewNote: () => void
}

export function NoteListToolbar({
  title,
  subtitle,
  isRefreshing,
  creating,
  canCreate,
  onOpenDrawer,
  onSearch,
  onRefresh,
  onNewNote,
}: ToolbarProps) {
  const [syncLabel,setSyncLabel]=useState('All synced')
  useEffect(()=>{const refresh=async(event?:Event)=>{const count=(await getOfflineRows('outbox')).length,detail=(event as CustomEvent<string>|undefined)?.detail;setSyncLabel(detail==='syncing'?'Syncing…':!navigator.onLine?`Offline · ${count} unsynced`:count?`Offline · ${count} unsynced`:'All synced')};const online=()=>{void syncNow();void refresh()};const update=(event:Event)=>void refresh(event);void refresh();window.addEventListener('online',online);window.addEventListener('offline',online);window.addEventListener('inotion:sync-status',update);return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',online);window.removeEventListener('inotion:sync-status',update)}},[])
  const iconBtn =
    'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-11'
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)] box-content">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open folders, tags and views"
        className={cn(iconBtn, 'md:hidden')}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-base leading-tight font-semibold text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <SyncStatusPill status={syncLabel === 'Syncing…' ? 'syncing' : syncLabel.startsWith('Offline') ? 'offline' : 'synced'} unsyncedCount={Number(syncLabel.match(/\d+/)?.[0] ?? 0)} onRetry={() => void syncNow()} />
      <button type="button" onClick={onSearch} aria-label="Search notes" className={iconBtn}>
        <Search className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh notes"
        disabled={isRefreshing}
        className={iconBtn}
      >
        <RotateCw
          className={cn('size-4', isRefreshing && 'animate-spin')}
          aria-hidden="true"
        />
      </button>
      {canCreate && (
        <Button
          onClick={onNewNote}
          disabled={creating}
          className="ml-1 h-8 gap-1 bg-blue-600 px-3 text-white hover:bg-blue-700 max-md:hidden"
        >
          {creating ? <Spinner /> : <Plus aria-hidden="true" />}
          New Note
        </Button>
      )}
    </header>
  )
}

function NoteRow({
  note,
  active,
  hasAttachments,
  onSelect,
}: {
  note: Note
  active: boolean
  hasAttachments: boolean
  onSelect: () => void
}) {
  const title = note.title.trim() || 'Untitled'
  const snippet = snippetFromMarkdown(note.body_md)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'block w-full px-4 py-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset focus-visible:outline-none pointer-coarse:min-h-14',
          active ? 'bg-blue-50' : 'hover:bg-secondary/70',
        )}
      >
        <div className="flex items-center gap-2">
          {note.is_pinned && (
            <Pin
              className="size-3.5 shrink-0 fill-amber-500 text-amber-500"
              aria-label="Pinned"
            />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-medium',
              !note.title.trim() && 'text-muted-foreground',
            )}
          >
            {title}
          </span>
          <time
            dateTime={note.updated_at}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {formatListTime(note.updated_at)}
          </time>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-muted-foreground">
            {snippet || 'No additional text'}
          </p>
          {hasAttachments && (
            <Paperclip
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="Has attachments"
            />
          )}
        </div>
        {note.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {note.tags.slice(0, 3).map((t) => (
              <span
                key={String(t.id)}
                className="max-w-28 truncate rounded-full bg-secondary px-2 py-0.5 text-[11px] leading-4 text-muted-foreground"
              >
                {t.name}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">
                +{note.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </button>
    </li>
  )
}

interface NoteListProps {
  route: Route
  items: Note[]
  isIdle: boolean
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: string | null
  hasData: boolean
  activeId?: string
  attachmentCounts: Record<string, number>
  scopeLabel: string
  creating: boolean
  onSelect: (note: Note) => void
  onRetry: () => void
  onLoadMore: () => void
  onNewNote: () => void
}

function emptyContent(
  route: Route,
  scopeLabel: string,
  onNewNote: () => void,
  creating: boolean,
): { icon: ReactNode; title: string; description: string; action?: ReactNode } {
  const newButton = (
    <Button
      onClick={onNewNote}
      disabled={creating}
      className="bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11"
    >
      <Plus aria-hidden="true" /> New Note
    </Button>
  )
  switch (route.kind) {
    case 'search':
      return route.q?.trim()
        ? {
            icon: <Search />,
            title: 'No matching notes',
            description: `Nothing in ${scopeLabel} matches “${route.q.trim()}”. Check the spelling or try a different word.`,
          }
        : {
            icon: <Search />,
            title: 'Search your notes',
            description: `Type to search titles and note text in ${scopeLabel}.`,
          }
    case 'pinned':
      return {
        icon: <Pin />,
        title: 'No pinned notes',
        description: 'Pin a note from the editor toolbar to keep it here for quick access.',
      }
    case 'archived':
      return {
        icon: <Archive />,
        title: 'Nothing archived',
        description: 'Archived notes are kept out of the way but never deleted.',
      }
    case 'trash':
      return {
        icon: <Trash2 />,
        title: 'Trash is empty',
        description: 'Notes you move to Trash appear here until you delete them permanently.',
      }
    case 'folder':
      return {
        icon: <FileText />,
        title: 'This folder is empty',
        description: 'Create a note here, or move existing notes into this folder from the editor.',
        action: newButton,
      }
    case 'tag':
      return {
        icon: <FileText />,
        title: 'No notes with this tag',
        description: 'Add this tag to a note from the editor to see it here.',
      }
    default:
      return {
        icon: <FileText />,
        title: 'No notes yet',
        description: 'Create your first note to get started.',
        action: newButton,
      }
  }
}

export function NoteList({
  route,
  items,
  isIdle,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  hasData,
  activeId,
  attachmentCounts,
  scopeLabel,
  creating,
  onSelect,
  onRetry,
  onLoadMore,
  onNewNote,
}: NoteListProps) {
  if (isLoading) return <ListSkeleton />
  if (error && !hasData) {
    return <BlockError title="Couldn’t load notes" message={error} onRetry={onRetry} />
  }
  if (isIdle || items.length === 0) {
    const e = emptyContent(route, scopeLabel, onNewNote, creating)
    return <EmptyState {...e} />
  }

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <span className="min-w-0 truncate">{error}</span>
          <button type="button" onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2">
            Retry
          </button>
        </div>
      )}
      <ul className="divide-y divide-border" aria-label="Notes">
        {items.map((note) => (
          <NoteRow
            key={String(note.id)}
            note={note}
            active={sameId(note.id, activeId)}
            hasAttachments={
              (attachmentCounts[String(note.id)] ?? note.attachment_count ?? (note.has_attachments ? 1 : 0)) > 0
            }
            onSelect={() => onSelect(note)}
          />
        ))}
      </ul>
      {hasMore && (
        <div className="border-t border-border p-3">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full pointer-coarse:h-11"
          >
            {isLoadingMore && <Spinner />}
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
