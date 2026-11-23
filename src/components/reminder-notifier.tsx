'use client'

import { useEffect, useRef } from 'react'
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

/**
 * Mount once near the app root. Fires an in-app toast and, when permitted,
 * a browser notification for reminders that fall due while the app is open.
 */
export function ReminderNotifier({ notes, onOpenNote }: ReminderNotifierProps) {
  const notesRef = useRef(notes)
  const openRef = useRef(onOpenNote)
  const startedAt = useRef(Date.now())
  const fired = useRef(new Set<string>())

  useEffect(() => {
    notesRef.current = notes
    openRef.current = onOpenNote
  })

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const note of notesRef.current) {
        const due = toTimestamp(note.reminderAt)
        if (due === null || due > now || due < startedAt.current) continue

        const key = `${note.id}:${due}`
        if (fired.current.has(key)) continue
        fired.current.add(key)

        const title = note.title.trim() || 'Untitled note'

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

  return null
}
