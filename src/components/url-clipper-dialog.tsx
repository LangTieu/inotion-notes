'use client'

import { useRef, useState } from 'react'
import { AlertCircle, Link2, Loader2, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface ClipPreview {
  url: string
  title: string
  description?: string
  content?: string
}

interface UrlClipperDialogProps {
  /** Fetches page metadata. Defaults to POST /api/clip with `{ url }`. */
  fetchPreview?: (url: string) => Promise<ClipPreview>
  /** Saves the previewed clip as a note. Throw to surface an error in the dialog. */
  onSave: (clip: ClipPreview) => Promise<void> | void
}

async function defaultFetchPreview(url: string): Promise<ClipPreview> {
  const response = await fetch('/api/clips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `Could not fetch that page (${response.status}).`)
  return { url, ...data, title: data?.title?.trim() || url }
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate)
    return parsed.hostname.includes('.') || parsed.hostname === 'localhost' ? parsed.toString() : null
  } catch {
    return null
  }
}

export function UrlClipperDialog({ fetchPreview = defaultFetchPreview, onSave }: UrlClipperDialogProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<ClipPreview | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)

  const reset = () => {
    requestId.current += 1
    setInput('')
    setPreview(null)
    setTitle('')
    setError(null)
    setLoading(false)
    setSaving(false)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const clip = async () => {
    const url = normalizeUrl(input)
    if (!url) {
      setError('Enter a valid URL, e.g. https://example.com/article')
      return
    }
    const id = ++requestId.current
    setError(null)
    setPreview(null)
    setLoading(true)
    try {
      const result = await fetchPreview(url)
      if (id !== requestId.current) return
      setPreview(result)
      setTitle(result.title)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err.message : 'Could not fetch that page.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  const save = async () => {
    if (!preview) return
    setError(null)
    setSaving(true)
    try {
      await onSave({ ...preview, title: title.trim() || preview.title })
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Scissors />
          Clip URL
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Clip a URL</DialogTitle>
          <DialogDescription className="text-sm">
            Paste a link to save the page as a note.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (loading || saving) return
            if (preview) void save()
            else void clip()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clip-url" className="text-xs text-muted-foreground">
              URL
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="clip-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoFocus
                  placeholder="https://example.com/article"
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value)
                    setError(null)
                    if (preview) {
                      setPreview(null)
                      setTitle('')
                    }
                  }}
                  aria-invalid={error && !preview ? true : undefined}
                  aria-describedby={error ? 'clip-error' : undefined}
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || saving || !input.trim()}
                onClick={() => void clip()}
              >
                {loading && <Loader2 className="animate-spin" />}
                {loading ? 'Fetching' : 'Clip'}
              </Button>
            </div>
          </div>

          {preview && (
            <div className="flex flex-col gap-1.5 rounded-lg border p-3">
              <label htmlFor="clip-title" className="text-xs text-muted-foreground">
                Title preview
              </label>
              <Input
                id="clip-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-9 text-sm"
              />
              {preview.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{preview.description}</p>
              )}
              <p className="truncate text-xs text-muted-foreground">{preview.url}</p>
            </div>
          )}

          {error && (
            <p
              id="clip-error"
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 px-2.5 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!preview || saving || loading}>
              {saving && <Loader2 className="animate-spin" />}
              Save as note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
