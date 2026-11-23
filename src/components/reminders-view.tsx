'use client'

import { useMemo } from 'react'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  formatReminder,
  toTimestamp,
  useNow,
  type ReminderNote,
} from './reminder-utils'

interface RemindersViewProps {
  notes: ReminderNote[]
  onOpenNote: (noteId: string) => void
  /** Clears the reminder for the given note. */
  onClearReminder: (noteId: string) => void
}

function ReminderRow({
  note,
  overdue,
  onOpenNote,
  onClearReminder,
}: {
  note: ReminderNote
  overdue: boolean
  onOpenNote: (noteId: string) => void
  onClearReminder: (noteId: string) => void
}) {
  const title = note.title.trim() || 'Untitled note'

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
      <Bell
        className={cn('size-4 shrink-0', overdue ? 'text-destructive' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => onOpenNote(note.id)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
        <span className="block truncate text-sm font-medium hover:underline">{title}</span>
        <span
          className={cn(
            'block text-xs',
            overdue ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {overdue ? 'Overdue · ' : ''}
          {formatReminder(note.reminderAt)}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Open ${title}`}
          title="Open note"
          onClick={() => onOpenNote(note.id)}
        >
          <ExternalLink />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onClearReminder(note.id)}
        >
          <Check />
          Done
        </Button>
      </div>
    </li>
  )
}

function Section({
  heading,
  count,
  children,
}: {
  heading: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
        <span className="rounded-md border px-1.5 py-px text-[11px] normal-case tracking-normal">
          {count}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  )
}

export function RemindersView({ notes, onOpenNote, onClearReminder }: RemindersViewProps) {
  const now = useNow()

  const { overdue, upcoming } = useMemo(() => {
    const withTime = notes
      .map((note) => ({ note, time: toTimestamp(note.reminderAt) }))
      .filter((entry): entry is { note: ReminderNote; time: number } => entry.time !== null)
      .sort((a, b) => a.time - b.time)

    return {
      overdue: withTime.filter((entry) => entry.time <= now).map((entry) => entry.note),
      upcoming: withTime.filter((entry) => entry.time > now).map((entry) => entry.note),
    }
  }, [notes, now])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground">Notes you asked to be reminded about.</p>
      </header>

      {overdue.length === 0 && upcoming.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Bell className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">No reminders</p>
          <p className="text-xs text-muted-foreground">
            Use the bell on a note to set one.
          </p>
        </div>
      )}

      {overdue.length > 0 && (
        <Section heading="Overdue" count={overdue.length}>
          {overdue.map((note) => (
            <ReminderRow
              key={note.id}
              note={note}
              overdue
              onOpenNote={onOpenNote}
              onClearReminder={onClearReminder}
            />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section heading="Upcoming" count={upcoming.length}>
          {upcoming.map((note) => (
            <ReminderRow
              key={note.id}
              note={note}
              overdue={false}
              onOpenNote={onOpenNote}
              onClearReminder={onClearReminder}
            />
          ))}
        </Section>
      )}
    </div>
  )
}
