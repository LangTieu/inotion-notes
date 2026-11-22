'use client'

import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { MAX_TAGS_PER_NOTE, type NoteTag, type Tag } from '@/lib/inotion/types'
import { cn } from '@/lib/utils'

interface TagPickerProps {
  selected: NoteTag[]
  allTags: Tag[]
  disabled?: boolean
  onChange: (tagIds: Array<string | number>) => void
  onCreate: (name: string) => Promise<Tag>
}

export function TagPicker({
  selected,
  allTags,
  disabled,
  onChange,
  onCreate,
}: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedIds = new Set(selected.map((t) => String(t.id)))
  const atLimit = selected.length >= MAX_TAGS_PER_NOTE
  const trimmed = filter.trim()
  const lower = trimmed.toLowerCase()
  const visible = allTags.filter((t) => t.name.toLowerCase().includes(lower))
  const exact = allTags.some((t) => t.name.toLowerCase() === lower)

  const toggle = (id: string | number) => {
    const key = String(id)
    if (selectedIds.has(key)) {
      onChange(selected.filter((t) => String(t.id) !== key).map((t) => t.id))
    } else if (!atLimit) {
      onChange([...selected.map((t) => t.id), id])
    }
  }

  const create = async () => {
    if (!trimmed || creating || atLimit) return
    setCreating(true)
    setError(null)
    try {
      const tag = await onCreate(trimmed)
      onChange([...selected.map((t) => t.id), tag.id])
      setFilter('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the tag.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {selected.map((tag) => (
        <span
          key={String(tag.id)}
          className="flex max-w-40 items-center gap-0.5 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs text-foreground"
        >
          <span className="truncate">{tag.name}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => toggle(tag.id)}
              aria-label={`Remove tag ${tag.name}`}
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-black/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-8"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) {
              setFilter('')
              setError(null)
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded-full border border-dashed border-input px-2.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:h-11"
            >
              <Plus className="size-3" aria-hidden="true" />
              {selected.length === 0 ? 'Add tags' : 'Tag'}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  if (trimmed && !exact) void create()
                  else if (visible.length === 1) toggle(visible[0].id)
                }
              }}
              placeholder="Find or create a tag"
              aria-label="Find or create a tag"
              autoFocus
              maxLength={60}
              className="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:h-11"
            />
            {atLimit && (
              <p className="px-1 pb-2 text-xs text-muted-foreground">
                This note has the maximum of {MAX_TAGS_PER_NOTE} tags.
              </p>
            )}
            {error && (
              <p role="alert" className="px-1 pb-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <ul className="max-h-48 overflow-y-auto" aria-label="Tags">
              {visible.map((tag) => {
                const checked = selectedIds.has(String(tag.id))
                return (
                  <li key={String(tag.id)}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(tag.id)}
                      disabled={!checked && atLimit}
                      className={cn(
                        'flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none disabled:opacity-50 pointer-coarse:min-h-11',
                      )}
                    >
                      <Check
                        className={cn('size-4 shrink-0 text-blue-600', !checked && 'invisible')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {visible.length === 0 && !trimmed && (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                No tags yet. Type a name to create one.
              </p>
            )}
            {trimmed && !exact && (
              <button
                type="button"
                onClick={create}
                disabled={creating || atLimit}
                className="mt-1 flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none disabled:opacity-50 pointer-coarse:min-h-11"
              >
                {creating ? <Spinner className="size-4" /> : <Plus className="size-4" aria-hidden="true" />}
                Create “{trimmed}”
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
