'use client'

import { useEffect, useRef, useState } from 'react'
import { toTimestamp, type ReminderNote } from './reminder-utils'

const CHECK_INTERVAL_MS = 15_000

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Call only when the user sets a reminder; never on page load. */
export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

interface ReminderNotifierProps {
  notes: ReminderNote[]
  onOpenNote?: (noteId: string) => void
}

interface OverdueItem {
  noteId: string
  title: string
}

/**
 * Mount once near the app root. Shows a banner for reminders that fell due
 * while the app was closed, and fires an in-app toast plus (when permitted)
 * a browser notification for reminders that fall due while the app is open.
 */
export function ReminderNotifier({ notes, onOpenNote }: ReminderNotifierProps) {
  const notesRef = useRef(notes)
  const openRef = useRef(onOpenNote)
  const startedAt = useRef(Date.now())
  const fired = useRef(new Set<string>())
  const [overdue, setOverdue] = useState<OverdueItem[]>([])

  useEffect(() => {
    notesRef.current = notes
    openRef.current = onOpenNote
  })

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const initial = now === startedAt.current
      for (const note of notesRef.current) {
        const due = toTimestamp(note.reminderAt)
        if (due === null || due > now) continue
        // On load, reminders that were already due when the app opened are
        // surfaced as an overdue banner instead of being skipped.
        if (!initial && due < startedAt.current) continue

        const key = `${note.id}:${due}`
        if (fired.current.has(key)) continue
        fired.current.add(key)

        const title = note.title.trim() || 'Untitled note'

        if (due < startedAt.current) {
          setOverdue(current => (current.some(item => item.noteId === note.id) ? current : [...current, { noteId: note.id, title }]))
          continue
        }

        window.dispatchEvent(new CustomEvent('inotion:reminder-due', { detail: { noteId: note.id, title } }))

        if (isNotificationSupported() && Notification.permission === 'granted') {
          try {
            const notification = new Notification(`Reminder: ${title}`, {
              body: 'This note is due now.',
              tag: key,
            })
            notification.onclick = () => {
              window.focus()
              openRef.current?.(note.id)
              notification.close()
            }
          } catch {
            // Some browsers only allow notifications via service workers.
          }
        }
      }
    }

    check()
    const id = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  if (overdue.length === 0) return null

  return (
    <div role="alert" className="fixed inset-x-3 bottom-3 z-50 rounded-md border border-amber-500/40 bg-amber-50 text-amber-950 shadow-lg dark:bg-amber-950 dark:text-amber-50 md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm">
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Overdue reminders</p>
          <ul className="mt-1 space-y-1">
            {overdue.map(item => (
              <li key={item.noteId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <button
                  type="button"
                  className="shrink-0 rounded border border-amber-600/40 px-2 py-0.5 text-xs hover:bg-amber-100 dark:hover:bg-amber-900"
                  onClick={() => {
                    openRef.current?.(item.noteId)
                    setOverdue(current => current.filter(entry => entry.noteId !== item.noteId))
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded px-1 text-xs text-amber-700 hover:underline dark:text-amber-300"
                  onClick={() => setOverdue(current => current.filter(entry => entry.noteId !== item.noteId))}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
