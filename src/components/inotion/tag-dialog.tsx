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
import { Spinner } from '@/components/ui/spinner'
import type { Tag } from '@/lib/inotion/types'
import { ErrorBox } from './state-views'

export type TagDialogState = { mode: 'create' } | { mode: 'rename'; tag: Tag }

interface TagDialogProps {
  state: TagDialogState | null
  onClose: () => void
  onSubmit: (state: TagDialogState, name: string) => Promise<void>
}

export function TagDialog({ state, onClose, onSubmit }: TagDialogProps) {
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {state && (
          <TagForm
            key={state.mode === 'create' ? 'create' : String(state.tag.id)}
            state={state}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TagForm({
  state,
  onClose,
  onSubmit,
}: Omit<TagDialogProps, 'state'> & { state: TagDialogState }) {
  const [name, setName] = useState(state.mode === 'rename' ? state.tag.name : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = state.mode === 'create' ? 'New tag' : 'Rename tag'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(state, trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the tag.')
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tag-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="tag-name"
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="pointer-coarse:h-11"
        />
      </div>
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
          disabled={busy || !name.trim()}
          className="bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11"
        >
          {busy && <Spinner />}
          {state.mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
