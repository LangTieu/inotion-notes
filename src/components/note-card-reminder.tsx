'use client'

import { ReminderBadge } from './reminder-badge'
import { ReminderPopover } from './reminder-popover'
import type { ReminderValue } from './reminder-utils'

interface NoteCardReminderProps {
  reminderAt?: ReminderValue
  onChange: (reminderAt: number | null) => void
}

/** Drop into a note card footer: shows the active reminder time plus the bell control. */
export function NoteCardReminder({ reminderAt, onChange }: NoteCardReminderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <ReminderBadge reminderAt={reminderAt} />
      <ReminderPopover variant="card" reminderAt={reminderAt} onChange={onChange} className="ml-auto" />
    </div>
  )
}
