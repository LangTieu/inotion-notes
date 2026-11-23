'use client'

import { useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ensureNotificationPermission } from './reminder-notifier'
import {
  formatReminder,
  isOverdue,
  laterToday,
  nextWeek,
  toDatetimeLocal,
  tomorrowMorning,
  toTimestamp,
  type ReminderValue,
} from './reminder-utils'

interface ReminderPopoverProps {
  reminderAt?: ReminderValue
  /** Receives a Unix timestamp in milliseconds, or null when cleared. */
  onChange: (reminderAt: number | null) => void
  variant?: 'card' | 'toolbar'
  className?: string
}

export function ReminderPopover({
  reminderAt,
  onChange,
  variant = 'card',
  className,
}: ReminderPopoverProps) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  const current = toTimestamp(reminderAt)
  const hasReminder = current !== null
  const overdue = hasReminder && isOverdue(current)

  const apply = (date: Date) => {
    if (Number.isNaN(date.getTime())) {
      setError('Pick a valid date and time.')
      return
    }
    if (date.getTime() <= Date.now()) {
      setError('Pick a time in the future.')
      return
    }
    void ensureNotificationPermission()
    onChange(date.getTime())
    setOpen(false)
  }

  const clear = () => {
    onChange(null)
    setOpen(false)
  }

  const presets = [
    { label: 'Later today', hint: '18:00', date: laterToday() },
    { label: 'Tomorrow', hint: '09:00', date: tomorrowMorning() },
    { label: 'Next week', hint: '09:00', date: nextWeek() },
  ]

  const Icon = overdue ? BellRing : hasReminder ? BellRing : Bell

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setCustom(toDatetimeLocal(reminderAt))
          setError(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant === 'toolbar' ? 'outline' : 'ghost'}
          size="icon"
          aria-label={hasReminder ? `Reminder set for ${formatReminder(reminderAt)}` : 'Set reminder'}
          title={hasReminder ? formatReminder(reminderAt) : 'Set reminder'}
          className={cn(
            hasReminder && (overdue ? 'text-destructive' : 'text-foreground'),
            !hasReminder && 'text-muted-foreground',
            className,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Remind me</p>
        <div className="flex flex-col">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => apply(preset.date)}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span>{preset.label}</span>
              <span className="text-xs text-muted-foreground">{preset.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
          <label htmlFor={`reminder-custom-${variant}`} className="px-2 text-xs text-muted-foreground">
            Custom date &amp; time
          </label>
          <div className="flex items-center gap-1.5 px-1">
            <Input
              id={`reminder-custom-${variant}`}
              type="datetime-local"
              value={custom}
              onChange={(event) => {
                setCustom(event.target.value)
                setError(null)
              }}
              className="h-8 flex-1 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!custom}
              onClick={() => apply(new Date(custom))}
            >
              Set
            </Button>
          </div>
          {error && (
            <p role="alert" className="px-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        {hasReminder && (
          <div className="mt-2 border-t pt-2">
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">
              Currently {formatReminder(reminderAt)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={clear}
            >
              <BellOff />
              Clear reminder
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
