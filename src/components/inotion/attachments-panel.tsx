'use client'

import { useRef, useState, type DragEvent } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Download,
  File as FileIcon,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { attachmentUrl } from '@/lib/inotion/api'
import { formatBytes } from '@/lib/inotion/format'
import { useAttachments } from '@/lib/inotion/use-attachments'
import { MAX_ATTACHMENT_BYTES, type Attachment, type Id } from '@/lib/inotion/types'
import { cn } from '@/lib/utils'
import { ErrorBox } from './state-views'

interface AttachmentsPanelProps {
  noteId: Id
  readOnly?: boolean
  onCountChange?: (noteId: Id, count: number) => void
}

function AttachmentRow({
  attachment,
  readOnly,
  onDelete,
}: {
  attachment: Attachment
  readOnly: boolean
  onDelete: (a: Attachment) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const isImage = attachment.content_type.startsWith('image/') && !imageFailed
  const url = attachmentUrl(attachment.id)

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary text-muted-foreground">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Preview of ${attachment.filename}`}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <FileIcon className="size-5" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={attachment.filename}>
          {attachment.filename}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatBytes(attachment.byte_size)} · {attachment.content_type}
        </p>
      </div>
      <a
        href={url}
        download={attachment.filename}
        aria-label={`Download ${attachment.filename}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-11"
      >
        <Download className="size-4" aria-hidden="true" />
      </a>
      {!readOnly && (
        <button
          type="button"
          disabled={busy}
          aria-label={`Delete ${attachment.filename}`}
          onClick={async () => {
            setBusy(true)
            try {
              await onDelete(attachment)
            } catch {
              setBusy(false)
            }
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none disabled:opacity-50 pointer-coarse:size-11"
        >
          {busy ? <Spinner className="size-4" /> : <Trash2 className="size-4" aria-hidden="true" />}
        </button>
      )}
    </li>
  )
}

export function AttachmentsPanel({ noteId, readOnly = false, onCountChange }: AttachmentsPanelProps) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const a = useAttachments(noteId, onCountChange)

  const count = a.attachments?.length ?? 0
  const percent = Math.min(100, (a.totalBytes / MAX_ATTACHMENT_BYTES) * 100)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (readOnly) return
    void a.upload(Array.from(e.dataTransfer.files))
  }

  return (
    <section aria-label="Attachments" className="shrink-0 border-t border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center gap-2 px-4 text-left text-sm font-medium text-foreground hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset focus-visible:outline-none pointer-coarse:min-h-11"
      >
        <ChevronRight
          className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
        <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
        Attachments
        {a.attachments && (
          <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {formatBytes(a.totalBytes)} of {formatBytes(MAX_ATTACHMENT_BYTES)}
        </span>
      </button>

      {open && (
        <div className="max-h-72 space-y-3 overflow-y-auto px-4 pt-1 pb-4">
          {a.warning && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">{a.warning}</p>
              <button
                type="button"
                onClick={a.dismissWarning}
                aria-label="Dismiss storage warning"
                className="flex size-5 items-center justify-center rounded hover:bg-amber-100 pointer-coarse:size-8"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          {a.uploadError && <ErrorBox message={a.uploadError} />}
          {a.removeError && <ErrorBox message={a.removeError} />}

          {a.isLoading ? (
            <div className="space-y-2" role="status" aria-label="Loading attachments">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : a.error ? (
            <ErrorBox message={a.error} onRetry={a.retry} />
          ) : count > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {a.attachments!.map((att) => (
                <AttachmentRow
                  key={String(att.id)}
                  attachment={att}
                  readOnly={readOnly}
                  onDelete={(x) => a.remove(x.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No attachments on this note.</p>
          )}

          {!readOnly && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-4 text-center transition-colors',
                dragging ? 'border-blue-600 bg-blue-50' : 'border-input bg-secondary/40',
              )}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose files to attach"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  void a.upload(files)
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={a.uploading}
                onClick={() => inputRef.current?.click()}
                className="pointer-coarse:h-11"
              >
                {a.uploading ? <Spinner /> : <Upload aria-hidden="true" />}
              {a.uploading ? 'Uploading…' : 'Upload files'}
              </Button>
              <p className="text-xs text-muted-foreground">or drop files here</p>
              <div className="w-full max-w-xs">
                {a.uploadProgress && <div className="mb-2 text-xs text-muted-foreground"><progress className="w-full" value={a.uploadProgress.loaded} max={a.uploadProgress.total} />{a.uploadProgress.filename} · {Math.round(a.uploadProgress.loaded/a.uploadProgress.total*100)}%</div>}
                <Progress
                  value={percent}
                  aria-label="Attachment storage used by this note"
                  className="h-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(a.totalBytes)} of {formatBytes(MAX_ATTACHMENT_BYTES)} used
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
