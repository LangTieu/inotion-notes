"use client"

import { useMemo, useState } from "react"
import { BookOpen, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SafeMarkdown, extractHeadings } from "@/components/safe-markdown"
import { cn } from "@/lib/utils"

export interface PublicNote {
  id: string
  title: string
  content: string
  updatedAt?: number
}

export interface PublicNotebook {
  title: string
  notes: PublicNote[]
}

export interface PublicNotebookViewProps {
  notebook: PublicNotebook
  initialNoteId?: string
  onSelectNote?: (noteId: string) => void
}

export function PublicNotebookView({ notebook, initialNoteId, onSelectNote }: PublicNotebookViewProps) {
  const [activeId, setActiveId] = useState(initialNoteId ?? notebook.notes[0]?.id)
  const [menuOpen, setMenuOpen] = useState(false)

  const activeNote = notebook.notes.find((n) => n.id === activeId) ?? notebook.notes[0]
  const headings = useMemo(() => (activeNote ? extractHeadings(activeNote.content) : []), [activeNote])

  function select(id: string) {
    setActiveId(id)
    setMenuOpen(false)
    onSelectNote?.(id)
    window.scrollTo({ top: 0 })
  }

  const toc = (
    <nav aria-label="Table of contents" className="flex flex-col gap-0.5 text-sm">
      {notebook.notes.map((note) => {
        const isActive = note.id === activeNote?.id
        return (
          <div key={note.id}>
            <button
              type="button"
              onClick={() => select(note.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {note.title || "Untitled"}
            </button>
            {isActive && headings.length > 0 && (
              <ul className="my-1 ml-3 flex flex-col border-l border-border">
                {headings
                  .filter((h) => h.level <= 3)
                  .map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        onClick={() => setMenuOpen(false)}
                        style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.5}rem` }}
                        className="block truncate py-1 pr-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-border bg-background px-4">
        <Button
          variant="outline"
          size="icon"
          className="size-7 bg-transparent md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="notebook-toc"
          aria-label={menuOpen ? "Close contents" : "Open contents"}
        >
          {menuOpen ? <X className="size-3.5" /> : <Menu className="size-3.5" />}
        </Button>
        <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
        <h1 className="truncate text-sm font-semibold">{notebook.title}</h1>
        <span className="ml-auto text-xs text-muted-foreground">Read-only</span>
      </header>

      <div className="mx-auto flex max-w-6xl">
        <aside
          id="notebook-toc"
          className={cn(
            "w-64 shrink-0 border-r border-border bg-background p-3",
            "max-md:fixed max-md:inset-x-0 max-md:top-11 max-md:z-10 max-md:w-full max-md:border-b max-md:border-r-0",
            menuOpen ? "max-md:block" : "max-md:hidden",
            "md:sticky md:top-11 md:h-[calc(100svh-2.75rem)] md:overflow-y-auto",
          )}
        >
          {notebook.notes.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No notes in this notebook.</p>
          ) : (
            toc
          )}
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
          {activeNote ? (
            <article className="max-w-2xl">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{activeNote.title || "Untitled"}</h1>
              {activeNote.updatedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {new Date(activeNote.updatedAt).toLocaleDateString()}
                </p>
              )}
              <SafeMarkdown source={activeNote.content} className="mt-4" />
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">This notebook is empty.</p>
          )}
        </main>
      </div>
    </div>
  )
}
