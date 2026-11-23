import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

type Mode = 'markdown' | 'rich' | 'preview'

interface Edit {
  value: string
  selStart: number
  selEnd: number
}

type EditFn = (value: string, start: number, end: number) => Edit

export interface RichMarkdownEditorProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  focusMode: boolean
  onToggleFocusMode: () => void
  renderPreview: (
    md: string,
    onToggleCheckbox: (lineIndex: number) => void,
  ) => ReactNode
  onSelectionChange?: (text: string, start: number, end: number) => void
}

/* ---------- Pure Markdown edit helpers (never touch anything outside the selection / touched lines) ---------- */

function wrapInline(
  before: string,
  after: string,
  placeholder: string,
): EditFn {
  return (value, start, end) => {
    const selected = value.slice(start, end)

    if (selected.length === 0) {
      const next =
        value.slice(0, start) + before + placeholder + after + value.slice(end)
      return {
        value: next,
        selStart: start + before.length,
        selEnd: start + before.length + placeholder.length,
      }
    }

    // Selection itself includes the markers: unwrap.
    if (
      selected.length > before.length + after.length &&
      selected.startsWith(before) &&
      selected.endsWith(after)
    ) {
      const inner = selected.slice(before.length, selected.length - after.length)
      return {
        value: value.slice(0, start) + inner + value.slice(end),
        selStart: start,
        selEnd: start + inner.length,
      }
    }

    // Markers sit right outside the selection: unwrap (guard `*` vs `**`).
    const outerBefore = value.slice(start - before.length, start)
    const outerAfter = value.slice(end, end + after.length)
    const ambiguousSingle =
      before.length === 1 && value[start - before.length - 1] === before
    if (
      start >= before.length &&
      outerBefore === before &&
      outerAfter === after &&
      !ambiguousSingle
    ) {
      return {
        value:
          value.slice(0, start - before.length) +
          selected +
          value.slice(end + after.length),
        selStart: start - before.length,
        selEnd: end - before.length,
      }
    }

    return {
      value:
        value.slice(0, start) + before + selected + after + value.slice(end),
      selStart: start + before.length,
      selEnd: end + before.length,
    }
  }
}

function transformLines(
  value: string,
  start: number,
  end: number,
  fn: (lines: string[]) => string[],
): Edit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
  const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end
  const found = value.indexOf('\n', effectiveEnd)
  const lineEnd = found === -1 ? value.length : found

  const block = value.slice(lineStart, lineEnd)
  const nextBlock = fn(block.split('\n')).join('\n')
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)

  if (start === end) {
    const caret = lineStart + nextBlock.length
    return { value: next, selStart: caret, selEnd: caret }
  }
  return {
    value: next,
    selStart: lineStart,
    selEnd: lineStart + nextBlock.length,
  }
}

const heading =
  (level: 1 | 2 | 3): EditFn =>
  (value, start, end) => {
    const prefix = '#'.repeat(level) + ' '
    return transformLines(value, start, end, (lines) => {
      const allHave = lines.every((l) => l.startsWith(prefix))
      return lines.map((l) =>
        allHave ? l.slice(prefix.length) : prefix + l.replace(/^#{1,6}\s+/, ''),
      )
    })
  }

const TASK_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s/
const LIST_PARTS_RE = /^(\s*)(?:(?:[-*+]|\d+[.)])\s+)?(?:\[[ xX]\]\s+)?(.*)$/

const checklist: EditFn = (value, start, end) =>
  transformLines(value, start, end, (lines) => {
    const nonBlank = lines.filter((l) => l.trim() !== '')
    const allTasks = nonBlank.length > 0 && nonBlank.every((l) => TASK_RE.test(l))
    return lines.map((l) => {
      if (l.trim() === '' && lines.length > 1) return l
      const m = l.match(LIST_PARTS_RE)
      const indent = m?.[1] ?? ''
      const rest = m?.[2] ?? l
      return allTasks ? indent + rest : `${indent}- [ ] ${rest}`
    })
  })

const quote: EditFn = (value, start, end) =>
  transformLines(value, start, end, (lines) => {
    const allQuoted = lines.every((l) => l.startsWith('> '))
    return lines.map((l) => {
      if (l.trim() === '' && lines.length > 1) return l
      return allQuoted ? l.slice(2) : '> ' + l
    })
  })

const code: EditFn = (value, start, end) => {
  const selected = value.slice(start, end)
  if (!selected.includes('\n')) return wrapInline('`', '`', 'code')(value, start, end)

  const open = '```\n'
  const close = '\n```'
  return {
    value: value.slice(0, start) + open + selected + close + value.slice(end),
    selStart: start + open.length,
    selEnd: start + open.length + selected.length,
  }
}

const table: EditFn = (value, start, end) => {
  const template =
    '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n'
  const head = value.slice(0, end)
  const tail = value.slice(end)
  const lead =
    head === '' ? '' : head.endsWith('\n\n') ? '' : head.endsWith('\n') ? '\n' : '\n\n'
  const trail = tail === '' || tail.startsWith('\n') ? '' : '\n'
  const insertAt = end + lead.length
  return {
    value: head + lead + template + trail + tail,
    selStart: insertAt + 2,
    selEnd: insertAt + 2 + 'Column 1'.length,
  }
}

const link: EditFn = (value, start, end) => {
  const selected = value.slice(start, end)
  const text = selected || 'link text'
  const url = 'https://'
  const prefix = `[${text}](`
  const urlStart = start + prefix.length
  return {
    value: value.slice(0, start) + prefix + url + ')' + value.slice(end),
    selStart: urlStart,
    selEnd: urlStart + url.length,
  }
}

function toggleTaskAtLine(value: string, lineIndex: number): string | null {
  const lines = value.split('\n')
  const line = lines[lineIndex]
  if (line === undefined) return null
  const next = line.replace(
    /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/,
    (_m, a: string, b: string, c: string) => a + (b === ' ' ? 'x' : ' ') + c,
  )
  if (next === line) return null
  lines[lineIndex] = next
  return lines.join('\n')
}

/* ---------- Presentation ---------- */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

interface ToolbarAction {
  key: string
  label: string
  shortcut?: string
  run: EditFn
  content: ReactNode
}

const ACTIONS: ToolbarAction[] = [
  { key: 'h1', label: 'Heading 1', run: heading(1), content: <span className="font-semibold">H1</span> },
  { key: 'h2', label: 'Heading 2', run: heading(2), content: <span className="font-semibold">H2</span> },
  { key: 'h3', label: 'Heading 3', run: heading(3), content: <span className="font-semibold">H3</span> },
  {
    key: 'bold',
    label: 'Bold',
    shortcut: '⌘B',
    run: wrapInline('**', '**', 'bold text'),
    content: <span className="font-bold">B</span>,
  },
  {
    key: 'italic',
    label: 'Italic',
    shortcut: '⌘I',
    run: wrapInline('*', '*', 'italic text'),
    content: <span className="font-serif italic">I</span>,
  },
  { key: 'code', label: 'Code', run: code, content: <span className="font-mono text-xs">{'</>'}</span> },
  {
    key: 'checklist',
    label: 'Checklist',
    run: checklist,
    content: (
      <Icon>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="m9 12 2 2 4-4" />
      </Icon>
    ),
  },
  {
    key: 'table',
    label: 'Table',
    run: table,
    content: (
      <Icon>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </Icon>
    ),
  },
  {
    key: 'quote',
    label: 'Quote',
    run: quote,
    content: (
      <Icon>
        <path d="M17 6H3M21 12H8M21 18H8M3 12v6" />
      </Icon>
    ),
  },
  {
    key: 'link',
    label: 'Link',
    shortcut: '⌘K',
    run: link,
    content: (
      <Icon>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </Icon>
    ),
  },
]

const SHORTCUTS: Record<string, string> = { b: 'bold', i: 'italic', k: 'link' }

const MODES: { id: Mode; label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'rich', label: 'Rich' },
  { id: 'preview', label: 'Preview' },
]

const toolbarButton =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-40'

export function RichMarkdownEditor({
  value,
  onChange,
  disabled = false,
  focusMode,
  onToggleFocusMode,
  renderPreview,
  onSelectionChange,
}: RichMarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('markdown')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const sel = pendingSelection.current
    const ta = textareaRef.current
    if (!sel || !ta) return
    ta.focus()
    ta.setSelectionRange(sel.start, sel.end)
    pendingSelection.current = null
  }, [value])

  const applyEdit = useCallback(
    (run: EditFn) => {
      const ta = textareaRef.current
      if (!ta || disabled) return
      const edit = run(value, ta.selectionStart, ta.selectionEnd)
      if (edit.value === value) {
        ta.focus()
        ta.setSelectionRange(edit.selStart, edit.selEnd)
        return
      }
      pendingSelection.current = { start: edit.selStart, end: edit.selEnd }
      onChange(edit.value)
    },
    [value, disabled, onChange],
  )

  const handleToggleCheckbox = useCallback(
    (lineIndex: number) => {
      if (disabled) return
      const next = toggleTaskAtLine(value, lineIndex)
      if (next !== null) onChange(next)
    },
    [value, disabled, onChange],
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && focusMode) {
      e.preventDefault()
      onToggleFocusMode()
      return
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      const actionKey = SHORTCUTS[e.key.toLowerCase()]
      const action = ACTIONS.find((a) => a.key === actionKey)
      if (action) {
        e.preventDefault()
        applyEdit(action.run)
      }
    }
  }

  const showToolbar = mode !== 'preview'

  const textarea = (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onSelect={(e) => onSelectionChange?.(e.currentTarget.value.slice(e.currentTarget.selectionStart, e.currentTarget.selectionEnd), e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
      onKeyUp={(e) => onSelectionChange?.(e.currentTarget.value.slice(e.currentTarget.selectionStart, e.currentTarget.selectionEnd), e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
      onKeyDown={handleKeyDown}
      readOnly={disabled}
      spellCheck
      aria-label="Note body (Markdown)"
      placeholder={disabled ? '' : 'Write in Markdown…'}
      className="block h-full min-h-96 w-full resize-none rounded-md border border-gray-200 bg-white p-4 font-mono text-sm leading-relaxed text-gray-900 placeholder:text-gray-500 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 read-only:bg-gray-50 read-only:text-gray-500"
    />
  )

  const preview = (
    <div className="h-full min-h-96 overflow-auto rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-900">
      {value.trim() === '' ? (
        <p className="text-gray-500">Nothing to preview yet.</p>
      ) : (
        renderPreview(value, handleToggleCheckbox)
      )}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 pb-2">
        <div
          role="group"
          aria-label="Editor mode"
          className="inline-flex rounded-md border border-gray-200 p-0.5"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`min-h-11 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                mode === m.id
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {showToolbar && (
          <div
            role="toolbar"
            aria-label="Markdown formatting"
            className="flex min-w-0 flex-wrap items-center"
          >
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={disabled}
                title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
                aria-label={a.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyEdit(a.run)}
                className={toolbarButton}
              >
                {a.content}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          aria-pressed={focusMode}
          onClick={onToggleFocusMode}
          title={focusMode ? 'Exit focus mode (Esc)' : 'Enter focus mode'}
          className={`ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            focusMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'border border-gray-200 text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Icon>
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </Icon>
          Focus
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {mode === 'markdown' && (
          <div className={`h-full ${focusMode ? 'mx-auto max-w-3xl' : ''}`}>
            {textarea}
          </div>
        )}

        {mode === 'rich' && (
          <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="min-h-0">{textarea}</div>
            <section aria-label="Live preview" className="min-h-0">
              {preview}
            </section>
          </div>
        )}

        {mode === 'preview' && (
          <section
            aria-label="Preview"
            className={`h-full ${focusMode ? 'mx-auto max-w-3xl' : ''}`}
          >
            {preview}
          </section>
        )}
      </div>
    </div>
  )
}

export default RichMarkdownEditor
