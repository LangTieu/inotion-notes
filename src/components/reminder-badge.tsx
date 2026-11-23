'use client'

import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatReminder,
  isOverdue,
  toTimestamp,
  useNow,
  type ReminderValue,
} from './reminder-utils'

interface ReminderBadgeProps {
  reminderAt?: ReminderValue
  className?: string
}

/** Compact bell + time indicator for note cards. Renders nothing without a reminder. */
export function ReminderBadge({ reminderAt, className }: ReminderBadgeProps) {
  const now = useNow()
  if (toTimestamp(reminderAt) === null) return null

  const overdue = isOverdue(reminderAt, now)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
        overdue
          ? 'border-destructive/40 text-destructive'
          : 'text-muted-foreground',
        className,
      )}
    >
      <Bell className="size-3" aria-hidden="true" />
      <span>{formatReminder(reminderAt)}</span>
      {overdue && <span className="sr-only">(overdue)</span>}
    </span>
  )
}
