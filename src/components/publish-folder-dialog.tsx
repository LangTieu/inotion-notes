"use client"

import { useState } from "react"
import { Globe } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export interface PublishFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderName: string
  noteCount?: number
  onConfirm: () => Promise<void>
}

export function PublishFolderDialog({ open, onOpenChange, folderName, noteCount, onConfirm }: PublishFolderDialogProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      setError("Could not publish this folder. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-sm">
            <Globe className="size-4" aria-hidden="true" />
            Publish &ldquo;{folderName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            Published folder notes are readable by anyone with the link. They are served as readable content rather
            than end-to-end encrypted snapshots{typeof noteCount === "number" ? `, and this applies to all ${noteCount} note${noteCount === 1 ? "" : "s"} in the folder` : ""}
            . Notes you add later will also become public. You can unpublish at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="h-8 text-xs">
            Cancel
          </AlertDialogCancel>
          <Button size="sm" onClick={handleConfirm} disabled={pending}>
            {pending && <Spinner />}
            Publish folder
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
