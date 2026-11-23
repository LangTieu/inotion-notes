
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Archive,
  ChevronRight,
  Download,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  LogOut,
  MoreHorizontal,
  Notebook,
  Pencil,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Tag as TagIcon,
  Trash2,
  FolderInput,
  KeyRound,
} from 'lucide-react'
import { ApiError, changePassword, publishFolder } from '@/lib/inotion/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { buildFolderTree, type FolderNode } from '@/lib/inotion/folders'
import type { Route } from '@/lib/inotion/route'
import type { AsyncList, Folder, Tag } from '@/lib/inotion/types'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './confirm-dialog'
import { ErrorBox } from './state-views'
import { SecurityModal } from './security-modal'
import { PublishFolderDialog } from '@/components/publish-folder-dialog'

export interface SidebarProps {
  route: Route
  email: string
  folders: AsyncList<Folder>
  tags: AsyncList<Tag>
  onNavigate: (route: Route) => void
  onOpenSearch: () => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (folder: Folder) => void
  onMoveFolder: (folder: Folder) => void
  onDeleteFolder: (folder: Folder) => Promise<void>
  onCreateTag: () => void
  onRenameTag: (tag: Tag) => void
  onDeleteTag: (tag: Tag) => Promise<void>
  onExport: () => Promise<void>
  onSignOut: () => Promise<void>
  className?: string
}

const rowBase =
  'group relative flex items-center rounded-md text-sm transition-colors'
const rowIdle = 'text-foreground hover:bg-black/5'
const rowActive = 'bg-blue-100 font-medium text-blue-700'

interface RowProps {
  active?: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  trailing?: ReactNode
  menu?: ReactNode
  indent?: number
  leading?: ReactNode
  ariaLabel?: string
}

function Row({
  active,
  onClick,
  icon,
  label,
  trailing,
  menu,
  indent = 0,
  leading,
  ariaLabel,
}: RowProps) {
  return (
    <div
      className={cn(rowBase, active ? rowActive : rowIdle)}
      style={{ paddingLeft: indent }}
    >
      {leading}
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        aria-label={ariaLabel}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:min-h-11"
      >
        <span
          className={cn(
            'shrink-0 [&_svg]:size-4',
            active ? 'text-blue-700' : 'text-muted-foreground',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
      </button>
      {menu}
    </div>
  )
}

function RowMenu({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-black/10 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex items-center justify-between px-2 pt-4 pb-1">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <button
        type="button"
        onClick={onAction}
        aria-label={actionLabel}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-11"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 px-2 py-2" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}

export function Sidebar({
  route,
  email,
  folders,
  tags,
  onNavigate,
  onOpenSearch,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onExport,
  onSignOut,
  className,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null)
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [shortcut, setShortcut] = useState('Ctrl K')
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [publishTarget, setPublishTarget] = useState<Folder | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) {
      setShortcut('⌘K')
    }
  }, [])

  const tree = buildFolderTree(folders.data ?? [])

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const runExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await onExport()
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const runSignOut = async () => {
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    setPasswordBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setPasswordError('Current password is incorrect.')
      else if (e instanceof ApiError && e.status === 400) setPasswordError(e.message)
      else if (e instanceof ApiError && e.status === 0) setPasswordError("Can't reach the server. Check your connection and try again.")
      else setPasswordError(e instanceof Error ? `${e.message} You can try again.` : 'Could not change password. Please try again.')
    } finally {
      setPasswordBusy(false)
    }
  }

  const closePasswordDialog = (open: boolean) => {
    setPasswordDialogOpen(open)
    if (!open) {
      setPasswordError(null)
      setPasswordSuccess(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const smartViews = [
    { kind: 'notes', label: 'All Notes', icon: <Notebook aria-hidden="true" /> },
    { kind: 'pinned', label: 'Pinned', icon: <Pin aria-hidden="true" /> },
    { kind: 'archived', label: 'Archived', icon: <Archive aria-hidden="true" /> },
    { kind: 'trash', label: 'Trash', icon: <Trash2 aria-hidden="true" /> },
  ] as const

  const renderFolder = (node: FolderNode): ReactNode => {
    const id = String(node.folder.id)
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(id)
    const active = route.kind === 'folder' && route.id === id
    return (
      <li key={id}>
        <Row
          active={active}
          onClick={() => onNavigate({ kind: 'folder', id })}
          icon={active ? <FolderOpen aria-hidden="true" /> : <FolderIcon aria-hidden="true" />}
          label={node.folder.name}
          indent={node.depth * 12}
          leading={
            hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.folder.name}`}
                aria-expanded={!isCollapsed}
                className="ml-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-8"
              >
                <ChevronRight
                  className={cn('size-3.5 transition-transform', !isCollapsed && 'rotate-90')}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="ml-1 size-5 shrink-0 pointer-coarse:size-8" aria-hidden="true" />
            )
          }
          menu={
            <RowMenu label={`Actions for folder ${node.folder.name}`}>
              <DropdownMenuItem onSelect={() => onCreateFolder(id)}>
                <FolderPlus aria-hidden="true" /> New subfolder
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRenameFolder(node.folder)}>
                <Pencil aria-hidden="true" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMoveFolder(node.folder)}>
                <FolderInput aria-hidden="true" /> Change parent
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPublishTarget(node.folder)}>
                <FolderIcon aria-hidden="true" /> Publish notebook…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setFolderToDelete(node.folder)}
              >
                <Trash2 aria-hidden="true" /> Delete
              </DropdownMenuItem>
            </RowMenu>
          }
        />
        {hasChildren && !isCollapsed && (
          <ul role="group">{node.children.map(renderFolder)}</ul>
        )}
      </li>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col bg-sidebar/95 text-sidebar-foreground backdrop-blur-xl',
        className,
      )}
    >
      <div className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search notes"
          className="flex h-8 w-full items-center gap-2 rounded-md bg-black/5 px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:h-11"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Search</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[11px] leading-none text-muted-foreground max-md:hidden">
            {shortcut}
          </kbd>
        </button>
      </div>

      <nav
        aria-label="Library"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
      >
        <ul className="space-y-0.5">
          {smartViews.map((v) => (
            <li key={v.kind}>
              <Row
                active={route.kind === v.kind}
                onClick={() => onNavigate({ kind: v.kind })}
                icon={v.icon}
                label={v.label}
              />
            </li>
          ))}
        </ul>

        <SectionHeader
          title="Folders"
          actionLabel="New folder"
          onAction={() => onCreateFolder(null)}
        />
        {folders.isLoading ? (
          <SectionSkeleton />
        ) : folders.error ? (
          <ErrorBox message={folders.error} onRetry={folders.onRetry} />
        ) : tree.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">No folders yet.</p>
        ) : (
          <ul className="space-y-0.5">{tree.map(renderFolder)}</ul>
        )}

        <SectionHeader title="Tags" actionLabel="New tag" onAction={onCreateTag} />
        {tags.isLoading ? (
          <SectionSkeleton />
        ) : tags.error ? (
          <ErrorBox message={tags.error} onRetry={tags.onRetry} />
        ) : (tags.data ?? []).length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {(tags.data ?? []).map((tag) => {
              const id = String(tag.id)
              return (
                <li key={id}>
                  <Row
                    active={route.kind === 'tag' && route.id === id}
                    onClick={() => onNavigate({ kind: 'tag', id })}
                    icon={<TagIcon aria-hidden="true" />}
                    label={tag.name}
                    trailing={
                      <span
                        className="rounded-full bg-black/5 px-1.5 text-xs tabular-nums text-muted-foreground"
                        aria-label={`${tag.note_count} notes`}
                      >
                        {tag.note_count}
                      </span>
                    }
                    menu={
                      <RowMenu label={`Actions for tag ${tag.name}`}>
                        <DropdownMenuItem onSelect={() => onRenameTag(tag)}>
                          <Pencil aria-hidden="true" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setTagToDelete(tag)}
                        >
                          <Trash2 aria-hidden="true" /> Delete
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {exportError && <ErrorBox message={exportError} />}
        <p className="truncate px-1 text-xs text-muted-foreground" title={email}>
          Signed in as <span className="font-medium text-foreground">{email}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={runExport}
            disabled={exporting}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 pointer-coarse:h-11 pointer-coarse:text-sm"
          >
            {exporting ? <Spinner className="size-3.5" /> : <Download className="size-3.5" aria-hidden="true" />}
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
          <button
            type="button"
            onClick={runSignOut}
            disabled={signingOut}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 pointer-coarse:h-11 pointer-coarse:text-sm"
          >
            {signingOut ? <Spinner className="size-3.5" /> : <LogOut className="size-3.5" aria-hidden="true" />}
            Sign out
          </button>
        </div>
        <button type="button" onClick={() => setSecurityOpen(true)} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary pointer-coarse:h-11">
          <ShieldCheck className="size-3.5" aria-hidden="true" /> Security
        </button>
        <SecurityModal open={securityOpen} onOpenChange={setSecurityOpen} />
        <button
          type="button"
          onClick={() => { setPasswordDialogOpen(true); setPasswordError(null); setPasswordSuccess(false) }}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:text-sm"
        >
          <KeyRound className="size-3.5" aria-hidden="true" /> Change password
        </button>
      </div>

      <Dialog open={passwordDialogOpen} onOpenChange={closePasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPasswordChange} className="space-y-4">
            <label className="block space-y-1.5 text-sm">Current password
              <input autoComplete="current-password" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3" />
            </label>
            <label className="block space-y-1.5 text-sm">New password
              <input autoComplete="new-password" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3" />
            </label>
            <label className="block space-y-1.5 text-sm">Confirm new password
              <input autoComplete="new-password" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3" />
            </label>
            {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
            {passwordSuccess && <p role="status" className="text-sm text-green-700">Password changed successfully.</p>}
            <DialogFooter>
              <button type="submit" disabled={passwordBusy} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{passwordBusy ? 'Saving…' : 'Change password'}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!folderToDelete}
        onOpenChange={(o) => !o && setFolderToDelete(null)}
        title={`Delete folder “${folderToDelete?.name ?? ''}”?`}
        description="Notes in this folder move to “No folder” and its subfolders move to the top level. No notes are deleted."
        confirmLabel="Delete folder"
        busyLabel="Deleting…"
        onConfirm={async () => {
          if (folderToDelete) await onDeleteFolder(folderToDelete)
        }}
      />
      <PublishFolderDialog open={!!publishTarget} onOpenChange={(open) => !open && setPublishTarget(null)} folderName={publishTarget?.name ?? ''} onConfirm={async () => {
        if (!publishTarget) return
        const slug = window.prompt('Public notebook URL slug')?.trim()
        if (!slug) throw new Error('A URL slug is required.')
        await publishFolder(publishTarget.id, slug, window.confirm('Include subfolders?'))
        window.alert(`Published at ${location.origin}/p/${slug}`)
        setPublishTarget(null)
      }} />
      <ConfirmDialog
        open={!!tagToDelete}
        onOpenChange={(o) => !o && setTagToDelete(null)}
        title={`Delete tag “${tagToDelete?.name ?? ''}”?`}
        description="The tag is removed from every note that uses it. The notes themselves are not deleted."
        confirmLabel="Delete tag"
        busyLabel="Deleting…"
        onConfirm={async () => {
          if (tagToDelete) await onDeleteTag(tagToDelete)
        }}
      />
    </div>
  )
}
