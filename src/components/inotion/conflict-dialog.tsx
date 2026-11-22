'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { ErrorBox } from './state-views'

interface ConflictDialogProps {
  open: boolean
  onReload: () => Promise<void>
  onOverwrite: () => Promise<void>
}

export function ConflictDialog({ open, onReload, onOverwrite }: ConflictDialogProps) {
  const [busy, setBusy] = useState<'reload' | 'overwrite' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'reload' | 'overwrite') => {
    setBusy(kind)
    setError(null)
    try {
      await (kind === 'reload' ? onReload() : onOverwrite())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>This note changed elsewhere</DialogTitle>
          <DialogDescription>
            A newer version of this note was saved from another tab or device. Your
            edits have not been saved. Choose which version to keep.
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorBox message={error} />}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => run('reload')}
            className="pointer-coarse:h-11"
          >
            {busy === 'reload' && <Spinner />}
            Reload latest
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => run('overwrite')}
            className="bg-blue-600 text-white hover:bg-blue-700 pointer-coarse:h-11"
          >
            {busy === 'overwrite' && <Spinner />}
            Overwrite with my changes
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">
          “Reload latest” discards your local edits. “Overwrite” replaces the
          newer version with what you have here.
        </p>
      </DialogContent>
    </Dialog>
  )
}
