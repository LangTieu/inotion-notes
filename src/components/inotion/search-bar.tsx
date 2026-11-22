'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  scopeLabel: string
  onChange: (q: string) => void
  onBack: () => void
}

export function SearchBar({ value, scopeLabel, onChange, onBack }: SearchBarProps) {
  const [text, setText] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSent = useRef(value)

  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (text === lastSent.current) return
    const t = setTimeout(() => {
      lastSent.current = text
      onChange(text)
    }, 250)
    return () => clearTimeout(t)
  }, [text, onChange])

  const clear = () => {
    setText('')
    lastSent.current = ''
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <header className="box-content flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to notes"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-11"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </button>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onBack()
          }}
          placeholder={`Search ${scopeLabel}`}
          aria-label={`Search ${scopeLabel}`}
          autoComplete="off"
          spellCheck={false}
          className="h-9 w-full rounded-md bg-secondary pr-9 pl-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none pointer-coarse:size-10"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  )
}
