"use client"

import { useState } from "react"
import { Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShareModal, type ShareModalProps } from "@/components/share-modal"

export type ShareButtonProps = Omit<ShareModalProps, "open" | "onOpenChange"> & {
  /** Optional hook, e.g. to lazily load links when the modal opens. */
  onOpen?: () => void
}

/** Drop-in editor toolbar button that owns the ShareModal open state. */
export function ShareButton({ onOpen, ...modalProps }: ShareButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 bg-transparent px-2 text-xs"
        onClick={() => {
          setOpen(true)
          onOpen?.()
        }}
      >
        <Share2 className="size-3.5" aria-hidden="true" />
        Share
        {modalProps.links.length > 0 && (
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{modalProps.links.length}</span>
        )}
      </Button>
      <ShareModal {...modalProps} open={open} onOpenChange={setOpen} />
    </>
  )
}
