'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { flattenFolders, folderAndDescendantIds } from '@/lib/inotion/folders'
import type { Folder } from '@/lib/inotion/types'
import { ErrorBox } from './state-views'

export type FolderDialogState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'rename'; folder: Folder }
  | { mode: 'move'; folder: Folder }

interface FolderDialogProps {
  state: FolderDialogState | null
  folders: Folder[]
  onClose: () => void
  onSubmit: (
    state: FolderDialogState,
    name: string,
    parentId: string | null,
  ) => Promise<void>
}

const ROOT = '__root__'

export function FolderDialog({
  state,
  folders,
  onClose,
  onSubmit,
}: FolderDialogProps) {
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {state && (
          <FolderForm
            key={
              state.mode === 'create'
                ? `create-${state.parentId ?? 'root'}`
                : `${state.mode}-${state.folder.id}`
            }
            state={state}
            folders={folders}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FolderForm({
  state,
  folders,
  onClose,
  onSubmit,
}: Omit<FolderDialogProps, 'state'> & { state: FolderDialogState }) {
  const initialParent =
    state.mode === 'create'
      ? (state.parentId ?? ROOT)
      : state.folder.parent_id != null
        ? String(state.folder.parent_id)
        : ROOT
  const [name, setName] = useState(state.mode === 'rename' ? state.folder.name : '')
  const [parent, setParent] = useState(initialParent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocked =
    state.mode === 'move'
      ? folderAndDescendantIds(folders, String(state.folder.id))
      : new Set<string>()
  const options = flattenFolders(folders).filter(
    (n) => !blocked.has(String(n.folder.id)),
  )

  const showName = state.mode !== 'move'
  const showParent = state.mode !== 'rename'
  const title =
    state.mode === 'create'
      ? state.parentId
        ? 'New subfolder'
        : 'New folder'
      : state.mode === 'rename'
        ? 'Rename folder'
        : `Move “${state.folder.name}”`
  const cta =
    state.mode === 'create' ? 'Create' : state.mode === 'rename' ? 'Rename' : 'Move'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (showName && !trimmed) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(
        state,
        showName ? trimmed : state.mode === 'move' ? state.folder.name : trimmed,
        parent === ROOT ? null : parent,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the folder.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
      </DialogHeader>
      {error && <ErrorBox message={error} />}
      {showName && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="folder-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="folder-name"
            autoFocus
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className="pointer-coarse:h-11"
          />
        </div>
      )}
      {showParent && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="folder-parent" className="text-sm font-medium">
            {state.mode === 'create' ? 'Create inside' : 'New parent'}
          </label>
          <Select value={parent} onValueChange={setParent}>
            <SelectTrigger id="folder-parent" className="w-full pointer-coarse:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT}>Top level</SelectItem>
              {options.map((n) => (
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
        </div>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={busy}
          className="pointer-coarse:h-11"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || (showName && !name.trim())}
          className="bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11"
        >
          {busy && <Spinner />}
          {cta}
        </Button>
      </DialogFooter>
    </form>
  )
}
