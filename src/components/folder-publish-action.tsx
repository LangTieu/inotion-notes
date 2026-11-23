"use client"

import { useState } from "react"
import { Check, Copy, Globe, GlobeLock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PublishFolderDialog } from "@/components/publish-folder-dialog"

export interface FolderPublishActionProps {
  folderName: string
  noteCount?: number
  isPublished: boolean
  /** Public URL (e.g. /p/:slug) shown once the folder is published. */
  publicUrl?: string
  onPublish: () => Promise<void>
  onUnpublish: () => Promise<void>
}

/** Compact per-folder control: publish (with confirmation), copy link, unpublish. */
export function FolderPublishAction({
  folderName,
  noteCount,
  isPublished,
  publicUrl,
  onPublish,
  onUnpublish,
}: FolderPublishActionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleUnpublish() {
    setUnpublishing(true)
    try {
      await onUnpublish()
    } finally {
      setUnpublishing(false)
    }
  }

  async function handleCopy() {
    if (!publicUrl) return
    const absolute = publicUrl.startsWith("/") ? `${window.location.origin}${publicUrl}` : publicUrl
    await navigator.clipboard.writeText(absolute)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {isPublished ? (
          <>
            {publicUrl && (
              <Button
                variant="outline"
                size="icon"
                className="size-6 bg-transparent"
                onClick={handleCopy}
                aria-label={`Copy public link for ${folderName}`}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 bg-transparent px-1.5 text-[11px]"
              onClick={handleUnpublish}
              disabled={unpublishing}
              aria-label={`Unpublish ${folderName}`}
            >
              {unpublishing ? <Spinner /> : <GlobeLock className="size-3" aria-hidden="true" />}
              Unpublish
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 bg-transparent px-1.5 text-[11px]"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Publish ${folderName}`}
          >
            <Globe className="size-3" aria-hidden="true" />
            Publish
          </Button>
        )}
      </div>

      <PublishFolderDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        folderName={folderName}
        noteCount={noteCount}
        onConfirm={onPublish}
      />
    </>
  )
}
