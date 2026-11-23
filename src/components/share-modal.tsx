"use client"

import { useState } from "react"
import { Check, Copy, Link2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type ShareExpiry = "24h" | "7d" | "30d" | "never"

export interface ShareLink {
  id: string
  /** Full URL including the #fragment that carries the decryption key. */
  url: string
  createdAt: number
  expiresAt: number | null
}

export interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  noteTitle?: string
  links: ShareLink[]
  isLoading?: boolean
  onCreate: (expiry: ShareExpiry) => Promise<void>
  onRevoke: (linkId: string) => Promise<void>
}

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
]

function describeExpiry(expiresAt: ShareLink["expiresAt"]) {
  if (!expiresAt) return "Never expires"
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return "Expired"
  const hours = Math.ceil(remaining / 3600000)
  return `Expires in ${hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.ceil(hours / 24)} day${Math.ceil(hours / 24) === 1 ? "" : "s"}`}`
}

function formatCreated(timestamp: number) {
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000))
  return days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`
}

export function ShareModal({
  open,
  onOpenChange,
  noteTitle,
  links,
  isLoading = false,
  onCreate,
  onRevoke,
}: ShareModalProps) {
  const [expiry, setExpiry] = useState<ShareExpiry>("7d")
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      await onCreate(expiry)
    } catch {
      setError("Could not create the link. Try again.")
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id)
    setError(null)
    try {
      await onRevoke(id)
    } catch {
      setError("Could not revoke the link. Try again.")
    } finally {
      setRevokingId(null)
    }
  }

  async function handleCopy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopiedId(link.id)
      setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 1800)
    } catch {
      setError("Copy failed. Select the link and copy it manually.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-sm font-semibold">Share note</DialogTitle>
          <DialogDescription className="text-xs">
            {noteTitle ? <span className="font-medium text-foreground">{noteTitle}</span> : "This note"} is encrypted
            in your browser. The key lives only in the link&apos;s #fragment and is never sent to the server.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <span id="share-expiry-label" className="text-xs font-medium text-muted-foreground">
            Link expires after
          </span>
          <div role="radiogroup" aria-labelledby="share-expiry-label" className="grid grid-cols-4 gap-1.5">
            {EXPIRY_OPTIONS.map((option) => {
              const selected = option.value === expiry
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setExpiry(option.value)}
                  className={cn(
                    "h-8 rounded-md border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Spinner /> : <Link2 className="size-3.5" />}
            Create link
          </Button>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto px-5 py-4">
          <h3 className="text-xs font-medium text-muted-foreground">Active links ({links.length})</h3>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Spinner /> Loading links
            </div>
          ) : links.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              No active links yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs" title={link.url.split("#")[0]}>
                      {link.url.split("#")[0]}
                      <span className="text-muted-foreground">#…</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Created {formatCreated(link.createdAt)} ·{" "}
                      {describeExpiry(link.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 shrink-0 bg-transparent"
                    onClick={() => handleCopy(link)}
                    aria-label="Copy link"
                  >
                    {copiedId === link.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 shrink-0 bg-transparent text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(link.id)}
                    disabled={revokingId === link.id}
                    aria-label="Revoke link"
                  >
                    {revokingId === link.id ? <Spinner /> : <Trash2 className="size-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
