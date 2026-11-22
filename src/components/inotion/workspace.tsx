'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, NotebookPen } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createFolder,
  createNote,
  createTag,
  deleteFolder,
  deleteTag,
  exportAllAsJson,
  getNote,
  listAttachments,
  listNotes,
  listFolders,
  listTags,
  updateFolder,
  updateTag,
  patchNote,
  uploadAttachment,
  uploadLargeAttachment,
} from '@/lib/inotion/api'
import {
  navigate,
  noteBelongsToRoute,
  openSearchRoute,
  scopeToRoute,
  useRoute,
  withNote,
  withoutNote,
  type Route,
} from '@/lib/inotion/route'
import { useNotesList } from '@/lib/inotion/use-notes-list'
import type { AsyncList, Folder, Id, Note, Tag } from '@/lib/inotion/types'
import { cn } from '@/lib/utils'
import { FolderDialog, type FolderDialogState } from './folder-dialog'
import { MobileTabBar, NewNoteFab } from './mobile-nav'
import { NoteEditor } from './note-editor'
import { ImportExportModal } from '../ImportExportModal'
import { NoteList, NoteListToolbar } from './note-list'
import { SearchBar } from './search-bar'
import { Sidebar } from './sidebar'
import { BlockError, EmptyState, ErrorBox } from './state-views'
import { TagDialog, type TagDialogState } from './tag-dialog'
import { parseImportFiles, type ImportReport } from '@/utils/importers'
import { markdownWorkspaceZip, triggerDownload } from '@/utils/exportFormats'
import type { ImportPreview, ImportProgress, ImportRunResult, ImportSource } from '../ImportExportModal'

interface WorkspaceProps {
  email: string
  onSignOut: () => Promise<void>
}

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : undefined

export function Workspace({ email, onSignOut }: WorkspaceProps) {
  const [importExportOpen, setImportExportOpen] = useState(false)
  const route = useRoute()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null)
  const [tagDialog, setTagDialog] = useState<TagDialogState | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (window.location.pathname === '/') navigate({ kind: 'notes' }, { replace: true })
  }, [])

  const foldersSwr = useSWR<Folder[]>('folders', listFolders, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const tagsSwr = useSWR<Tag[]>('tags', listTags, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const folders = foldersSwr.data ?? []
  const tags = tagsSwr.data ?? []

  const foldersList: AsyncList<Folder> = {
    data: foldersSwr.data,
    isLoading: foldersSwr.isLoading,
    error: foldersSwr.error ? (errorMessage(foldersSwr.error) ?? 'Could not load folders.') : null,
    onRetry: () => void foldersSwr.mutate(),
  }
  const tagsList: AsyncList<Tag> = {
    data: tagsSwr.data,
    isLoading: tagsSwr.isLoading,
    error: tagsSwr.error ? (errorMessage(tagsSwr.error) ?? 'Could not load tags.') : null,
    onRetry: () => void tagsSwr.mutate(),
  }

  const list = useNotesList(route)

  /* ---- open note ---- */
  const noteId = route.noteId
  const openedAt = useMemo(() => Date.now(), [noteId])
  const noteKey = noteId ? (['note', noteId, openedAt] as const) : null
  const noteSwr = useSWR<Note>(noteKey, () => getNote(noteId!), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const { mutate: mutateNote } = noteSwr
  const { mutate: mutateTags } = tagsSwr
  const { patchNote: patchListNote, removeNote, addNote, reload } = list

  const handleUpdated = useCallback(
    (note: Note) => {
      void mutateNote(note, { revalidate: false })
      patchListNote(note)
      void mutateTags()
      if (!noteBelongsToRoute(note, route)) {
        navigate(withoutNote(route), { replace: true })
      }
    },
    [mutateNote, patchListNote, mutateTags, route],
  )

  const handleDeleted = useCallback(
    (id: Id) => {
      removeNote(id)
      void mutateTags()
      navigate(withoutNote(route), { replace: true })
    },
    [removeNote, mutateTags, route],
  )

  const handleAttachmentCount = useCallback((id: Id, count: number) => {
    setAttachmentCounts((prev) =>
      prev[String(id)] === count ? prev : { ...prev, [String(id)]: count },
    )
  }, [])

  const handleCreateTag = useCallback(
    async (name: string) => {
      const tag = await createTag(name)
      await mutateTags()
      return tag
    },
    [mutateTags],
  )

  /* ---- navigation ---- */
  const goTo = (next: Route) => {
    setDrawerOpen(false)
    navigate(next)
  }
  const openSearch = useCallback(() => {
    setDrawerOpen(false)
    navigate(openSearchRoute(route))
  }, [route])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  const changeQuery = useCallback(
    (q: string) => {
      if (route.kind !== 'search') return
      navigate({ ...route, q, noteId: undefined }, { replace: true })
    },
    [route],
  )

  /* ---- new note ---- */
  const newNote = async () => {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const inFolder = route.kind === 'folder' ? route.id : undefined
      const folderId = inFolder
        ? (folders.find((f) => String(f.id) === inFolder)?.id ?? inFolder)
        : undefined
      const note = await createNote({
        title: '',
        body_md: '',
        ...(folderId != null ? { folder_id: folderId } : {}),
      })
      const target: Route =
        route.kind === 'notes' || route.kind === 'folder'
          ? route
          : { kind: 'notes' }
      if (target === route) addNote(note)
      void mutateTags()
      navigate(withNote(target, note.id))
    } catch (e) {
      setCreateError(errorMessage(e) ?? 'Could not create the note.')
    } finally {
      setCreating(false)
    }
  }

  /* ---- folders and tags ---- */
  const resolveFolderId = (id: string | null) =>
    id == null ? null : (folders.find((f) => String(f.id) === id)?.id ?? id)

  const submitFolder = async (
    state: FolderDialogState,
    name: string,
    parentId: string | null,
  ) => {
    if (state.mode === 'create') {
      await createFolder(name, resolveFolderId(parentId))
    } else if (state.mode === 'rename') {
      await updateFolder(state.folder.id, name, state.folder.parent_id)
    } else {
      await updateFolder(state.folder.id, state.folder.name, resolveFolderId(parentId))
    }
    await foldersSwr.mutate()
  }

  const removeFolder = async (folder: Folder) => {
    await deleteFolder(folder.id)
    await foldersSwr.mutate()
    if (route.kind === 'folder' && route.id === String(folder.id)) {
      navigate({ kind: 'notes' })
    } else {
      reload()
    }
  }

  const submitTag = async (state: TagDialogState, name: string) => {
    if (state.mode === 'create') await createTag(name)
    else await updateTag(state.tag.id, name)
    await tagsSwr.mutate()
    if (state.mode === 'rename') reload()
  }

  const removeTag = async (tag: Tag) => {
    await deleteTag(tag.id)
    await tagsSwr.mutate()
    if (route.kind === 'tag' && route.id === String(tag.id)) {
      navigate({ kind: 'notes' })
    } else {
      reload()
    }
  }

  const exportAll = async () => {
    await exportAllAsJson()
  }

  /* ---- labels ---- */
  const folderName = (id?: string) =>
    folders.find((f) => String(f.id) === id)?.name
  const tagName = (id?: string) => tags.find((t) => String(t.id) === id)?.name

  const viewTitle = (() => {
    switch (route.kind) {
      case 'notes':
        return 'All Notes'
      case 'pinned':
        return 'Pinned'
      case 'archived':
        return 'Archived'
      case 'trash':
        return 'Trash'
      case 'folder':
        return folderName(route.id) ?? 'Folder'
      case 'tag':
        return tagName(route.id) ?? 'Tag'
      case 'search':
        return 'Search'
    }
  })()

  const scopeLabel = (() => {
    const s = route.kind === 'search' ? route.scope : undefined
    if (!s) return 'all notes'
    if (s.view === 'archived') return 'archived notes'
    if (s.view === 'trashed') return 'Trash'
    if (s.folder) return `folder “${folderName(s.folder) ?? 'Folder'}”`
    if (s.tag) return `tag “${tagName(s.tag) ?? 'Tag'}”`
    return 'all notes'
  })()

  const canCreate = ['notes', 'folder', 'pinned', 'tag'].includes(route.kind)
  const isSearch = route.kind === 'search'
  const subtitle = list.isIdle
    ? undefined
    : list.hasData
      ? `${list.items.length}${list.hasMore ? '+' : ''} ${list.items.length === 1 ? 'note' : 'notes'}`
      : undefined

  const sidebarProps = {
    route,
    email,
    folders: foldersList,
    tags: tagsList,
    onOpenSearch: openSearch,
    onCreateFolder: (parentId: string | null) =>
      setFolderDialog({ mode: 'create', parentId }),
    onRenameFolder: (folder: Folder) => setFolderDialog({ mode: 'rename', folder }),
    onMoveFolder: (folder: Folder) => setFolderDialog({ mode: 'move', folder }),
    onDeleteFolder: removeFolder,
    onCreateTag: () => setTagDialog({ mode: 'create' }),
    onRenameTag: (tag: Tag) => setTagDialog({ mode: 'rename', tag }),
    onDeleteTag: removeTag,
    onExport: exportAll,
    onSignOut,
  }

  const mobileBack = () => navigate(withoutNote(route))

  const renderEditorPane = () => {
    if (!noteId) {
      return (
        <EmptyState
          icon={<NotebookPen />}
          title="No note selected"
          description="Choose a note from the list, or create a new one."
        />
      )
    }
    if (noteSwr.isLoading || (!noteSwr.data && !noteSwr.error)) {
      return (
        <div className="flex h-full flex-col" role="status" aria-label="Loading note">
          <div className="flex h-14 items-center border-b border-border px-3 md:hidden">
            <button
              type="button"
              onClick={mobileBack}
              aria-label="Back to notes"
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-4 p-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>
      )
    }
    if (noteSwr.error || !noteSwr.data) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center border-b border-border px-3 md:hidden">
            <button
              type="button"
              onClick={mobileBack}
              aria-label="Back to notes"
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
          </div>
          <BlockError
            title="Couldn’t open this note"
            message={errorMessage(noteSwr.error) ?? 'The note could not be loaded.'}
            onRetry={() => void mutateNote()}
          />
        </div>
      )
    }
    return (
      <NoteEditor
        key={String(noteSwr.data.id)}
        note={noteSwr.data}
        folders={folders}
        tags={tags}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
        onBack={mobileBack}
        onCreateTag={handleCreateTag}
        onAttachmentCount={handleAttachmentCount}
        onExportAll={exportAll}
      />
    )
  }

  const onParseImport = async (files: FileList | File[], _source: ImportSource): Promise<ImportPreview> => {
    const report = await parseImportFiles(Array.from(files))
    return {
      notes: report.notes.length,
      folders: report.folders.length,
      tags: report.tags.length,
      attachments: report.attachmentCount,
      payload: report,
    }
  }
  const onRunImport = async (
    payload: unknown,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<ImportRunResult> => {
    const report = payload as ImportReport
    const errors: ImportRunResult['errors'] = report.errors.map((error) => ({ item: error.file, message: error.error }))
    const folderMap = new Map<string, string>()
    const knownFolders = foldersSwr.data ?? []
    const seedFolder = (folder: Folder, parent = '') => {
      const path = parent ? `${parent}/${folder.name}` : folder.name
      folderMap.set(path, String(folder.id))
      knownFolders.filter((child) => String(child.parent_id) === String(folder.id)).forEach((child) => seedFolder(child, path))
    }
    knownFolders.filter((folder) => folder.parent_id == null).forEach((folder) => seedFolder(folder))
    const ensureFolder = async (path: string): Promise<string | null> => {
      if (!path) return null
      const existing = folderMap.get(path)
      if (existing) return existing
      const parts = path.split('/')
      const parent = await ensureFolder(parts.slice(0, -1).join('/'))
      const created = await createFolder(parts.at(-1)!, parent)
      folderMap.set(path, String(created.id))
      return String(created.id)
    }
    const allTags = await listTags()
    let done = 0
    for (const item of report.notes) {
      try {
        const note = await createNote({ title: item.title, body_md: item.body_md, folder_id: await ensureFolder(item.folder) })
        const tagIds = [] as (string | number)[]
        for (const name of item.tags) {
          let tag = allTags.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())
          if (!tag) { tag = await createTag(name); allTags.push(tag) }
          tagIds.push(tag.id)
        }
        if (tagIds.length) await patchNote(note.id, note.revision, { tag_ids: tagIds })
        for (const file of item.attachments) {
          if (file.size > 25 * 1024 * 1024) await uploadLargeAttachment(note.id, file)
          else await uploadAttachment(note.id, file)
        }
        done += 1
      } catch (error) {
        errors.push({ item: item.source || item.title, message: error instanceof Error ? error.message : 'Import failed' })
      }
      onProgress({ done, total: report.notes.length, label: `Imported ${done} of ${report.notes.length} notes` })
    }
    void list.reload()
    void tagsSwr.mutate()
    void foldersSwr.mutate()
    return { succeeded: done, errors }
  }
  const onExportMarkdownZip = async (_onProgress?: (progress: { done: number; total: number }) => void) => {
    const all: Note[] = []
    for (const view of ['all', 'archived', 'trashed'] as const) {
      let cursor = 0
      for (let pageIndex = 0; pageIndex < 10000; pageIndex += 1) {
        const page = await listNotes({ view }, cursor)
        all.push(...page.notes)
        if (page.nextCursor == null || page.nextCursor <= cursor) break
        cursor = page.nextCursor
      }
    }
    const metadata: Record<string, string[]> = {}
    for (const note of all) metadata[String(note.id)] = (await listAttachments(note.id)).map((attachment) => attachment.filename)
    const bytes = markdownWorkspaceZip(all, foldersSwr.data ?? [], metadata)
    triggerDownload('inotion-markdown.zip', new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }))
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <button type="button" className="fixed right-3 top-3 z-20 rounded-md border bg-background px-3 py-2 text-xs shadow-sm" onClick={() => setImportExportOpen(true)}>Import / Export</button>
      <ImportExportModal
        open={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        onParseImport={onParseImport}
        onRunImport={onRunImport}
        onExportJson={async () => { await exportAllAsJson() }}
        onExportMarkdownZip={onExportMarkdownZip}
      />
      <aside
        aria-label="Sidebar"
        className="hidden w-64 shrink-0 border-r border-sidebar-border md:flex xl:w-72"
      >
        <Sidebar {...sidebarProps} onNavigate={navigate} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isSearch && (
          <div className={cn(noteId && 'max-md:hidden')}>
            <SearchBar
              value={route.q ?? ''}
              scopeLabel={scopeLabel}
              onChange={changeQuery}
              onBack={() => navigate(scopeToRoute(route.scope))}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <section
            aria-label="Notes list"
            className={cn(
              'min-w-0 flex-col bg-background md:flex md:w-80 md:shrink-0 md:border-r md:border-border xl:w-96',
              noteId ? 'hidden' : 'flex flex-1 md:flex-none',
            )}
          >
            {!isSearch && (
              <NoteListToolbar
                title={viewTitle}
                subtitle={subtitle}
                isRefreshing={list.isRefreshing}
                creating={creating}
                canCreate={canCreate}
                onOpenDrawer={() => setDrawerOpen(true)}
                onSearch={openSearch}
                onRefresh={() => {
                  void foldersSwr.mutate()
                  void tagsSwr.mutate()
                  list.reload()
                }}
                onNewNote={newNote}
              />
            )}
            {createError && (
              <div className="px-3 pt-3">
                <ErrorBox message={createError} />
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <NoteList
                route={route}
                items={list.items}
                isIdle={list.isIdle}
                isLoading={list.isLoading}
                isLoadingMore={list.isLoadingMore}
                hasMore={list.hasMore}
                error={list.error}
                hasData={list.hasData}
                activeId={noteId}
                attachmentCounts={attachmentCounts}
                scopeLabel={scopeLabel}
                creating={creating}
                onSelect={(n) => navigate(withNote(route, n.id))}
                onRetry={list.reload}
                onLoadMore={list.loadMore}
                onNewNote={newNote}
              />
            </div>
          </section>

          <section
            aria-label="Editor"
            className={cn(
              'min-w-0 flex-1 flex-col bg-background md:flex',
              noteId ? 'flex' : 'hidden',
            )}
          >
            {renderEditorPane()}
          </section>
        </div>

        {!noteId && (
          <MobileTabBar
            active={isSearch ? 'search' : 'notes'}
            onNotes={() => goTo(isSearch ? scopeToRoute(route.scope) : { kind: 'notes' })}
            onSearch={openSearch}
          />
        )}
      </div>

      {!noteId && canCreate && <NewNoteFab onClick={newNote} disabled={creating} />}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[85vw] max-w-80 gap-0 bg-sidebar p-0 md:hidden"
        >
          <SheetTitle className="sr-only">Folders, tags and views</SheetTitle>
          <SheetDescription className="sr-only">
            Browse folders, tags and smart views, or manage your account.
          </SheetDescription>
          <Sidebar
            {...sidebarProps}
            onNavigate={goTo}
            onOpenSearch={openSearch}
            onCreateFolder={(p) => {
              setDrawerOpen(false)
              sidebarProps.onCreateFolder(p)
            }}
            onCreateTag={() => {
              setDrawerOpen(false)
              sidebarProps.onCreateTag()
            }}
            onRenameFolder={(f) => {
              setDrawerOpen(false)
              sidebarProps.onRenameFolder(f)
            }}
            onMoveFolder={(f) => {
              setDrawerOpen(false)
              sidebarProps.onMoveFolder(f)
            }}
            onRenameTag={(t) => {
              setDrawerOpen(false)
              sidebarProps.onRenameTag(t)
            }}
          />
        </SheetContent>
      </Sheet>

      <FolderDialog
        state={folderDialog}
        folders={folders}
        onClose={() => setFolderDialog(null)}
        onSubmit={submitFolder}
      />
      <TagDialog
        state={tagDialog}
        onClose={() => setTagDialog(null)}
        onSubmit={submitTag}
      />
    </div>
  )
}
