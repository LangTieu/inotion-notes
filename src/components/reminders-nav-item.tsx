'use client'

import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isOverdue, toTimestamp, useNow, type ReminderNote } from './reminder-utils'

interface RemindersNavItemProps {
  notes: ReminderNote[]
  active?: boolean
  onSelect: () => void
  className?: string
}

/** Sidebar entry for the Reminders view with an overdue-aware count. */
export function RemindersNavItem({ notes, active, onSelect, className }: RemindersNavItemProps) {
  const now = useNow()
  const withReminder = notes.filter((note) => toTimestamp(note.reminderAt) !== null)
  const overdueCount = withReminder.filter((note) => isOverdue(note.reminderAt, now)).length

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        active && 'bg-accent font-medium',
        className,
      )}
    >
      <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-left">Reminders</span>
      {withReminder.length > 0 && (
        <span
          className={cn(
            'rounded-md border px-1.5 py-px text-[11px]',
            overdueCount > 0 ? 'border-destructive/40 text-destructive' : 'text-muted-foreground',
          )}
        >
          {overdueCount > 0 ? `${overdueCount} due` : withReminder.length}
        </span>
      )}
    </button>
  )
}
