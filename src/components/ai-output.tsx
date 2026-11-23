"use client"

import { useEffect, useRef } from "react"
import { Btn, CopyButton, Spinner } from "./inotion-ui"

export function AiOutput({
  text,
  label,
  streaming,
  error,
  canReplace,
  onStop,
  onInsertBelow,
  onReplaceSelection,
}: {
  text: string
  label: string
  streaming: boolean
  error: string | null
  canReplace: boolean
  onStop: () => void
  onInsertBelow: () => void
  onReplaceSelection: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && streaming) el.scrollTop = el.scrollHeight
  }, [text, streaming])

  if (!text && !streaming && !error) return null

  const hasText = text.trim().length > 0

  return (
    <section aria-label="AI output" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
          {label}
          {streaming ? <Spinner /> : null}
        </h3>
        {streaming ? (
          <Btn onClick={onStop}>Stop</Btn>
        ) : hasText ? (
          <CopyButton value={text} variant="ghost" />
        ) : null}
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-busy={streaming}
        className="max-h-72 min-h-16 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-[13px] leading-relaxed text-neutral-800"
      >
        {text || (streaming ? <span className="text-neutral-400">Thinking…</span> : null)}
        {streaming ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse bg-neutral-500"
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="break-words text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Btn variant="primary" onClick={onInsertBelow} disabled={streaming || !hasText}>
          Insert below
        </Btn>
        <Btn
          onClick={onReplaceSelection}
          disabled={streaming || !hasText || !canReplace}
          title={canReplace ? undefined : "Select text in the note and run an action on it"}
        >
          Replace selection
        </Btn>
      </div>
    </section>
  )
}
