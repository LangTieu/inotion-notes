'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWRInfinite from 'swr/infinite'
import { listNotes } from './api'
import { sameId } from './format'
import { noteBelongsToRoute, routeToQuery, type Route } from './route'
import type { Note, NotesPage, NotesView } from './types'

type Key = readonly [
  'notes',
  NotesView,
  string,
  string,
  string,
  number,
]

const MIN_PINNED_BEFORE_STOP = 15

export function useNotesList(route: Route) {
  const query = useMemo(
    () => routeToQuery(route),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route.kind, route.id, route.q, route.scope?.view, route.scope?.folder, route.scope?.tag],
  )
  const isPinnedView = route.kind === 'pinned'

  const getKey = (index: number, previous: NotesPage | null): Key | null => {
    if (!query) return null
    if (index > 0 && (!previous || previous.nextCursor == null)) return null
    return [
      'notes',
      query.view,
      query.folder ?? '',
      query.tag ?? '',
      query.q ?? '',
      index === 0 ? 0 : (previous?.nextCursor ?? 0),
    ]
  }

  const swr = useSWRInfinite<NotesPage>(
    getKey,
    (key: unknown) => {
      const [, view, folder, tag, q, cursor] = key as Key
      return listNotes(
        { view, folder: folder || null, tag: tag || null, q: q || undefined },
        cursor,
      )
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateFirstPage: true,
      shouldRetryOnError: false,
    },
  )

  const { data, error, isLoading, isValidating, size, setSize, mutate } = swr

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: Note[] = []
    for (const page of data ?? []) {
      for (const note of page.notes) {
        const id = String(note.id)
        if (seen.has(id)) continue
        seen.add(id)
        if (isPinnedView && !note.is_pinned) continue
        out.push(note)
      }
    }
    return out
  }, [data, isPinnedView])

  const last = data?.[data.length - 1]
  const hasMore = !!last && last.nextCursor != null
  const isLoadingMore =
    !isLoading && size > 0 && !!data && typeof data[size - 1] === 'undefined'

  // The Pinned view filters client-side, so keep paging until it has enough.
  useEffect(() => {
    if (
      isPinnedView &&
      hasMore &&
      !isValidating &&
      !error &&
      items.length < MIN_PINNED_BEFORE_STOP
    ) {
      void setSize((s) => s + 1)
    }
  }, [isPinnedView, hasMore, isValidating, error, items.length, setSize])

  const loadMore = useCallback(() => {
    void setSize((s) => s + 1)
  }, [setSize])

  const reload = useCallback(() => {
    void setSize(1)
    void mutate()
  }, [setSize, mutate])

  const patchNote = useCallback(
    (note: Note) => {
      void mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            notes: page.notes.flatMap((n) =>
              sameId(n.id, note.id)
                ? noteBelongsToRoute(note, route)
                  ? [note]
                  : []
                : [n],
            ),
          })),
        { revalidate: false },
      )
    },
    [mutate, route],
  )

  const removeNote = useCallback(
    (id: string | number) => {
      void mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            notes: page.notes.filter((n) => !sameId(n.id, id)),
          })),
        { revalidate: false },
      )
    },
    [mutate],
  )

  const addNote = useCallback(
    (note: Note) => {
      if (!noteBelongsToRoute(note, route)) return
      void mutate(
        (pages) => {
          if (!pages || pages.length === 0) {
            return [{ notes: [note], nextCursor: null }]
          }
          const [first, ...rest] = pages
          return [{ ...first, notes: [note, ...first.notes] }, ...rest]
        },
        { revalidate: false },
      )
    },
    [mutate, route],
  )

  return {
    items,
    isIdle: !query,
    isLoading,
    isLoadingMore,
    isRefreshing: isValidating && !isLoading && !isLoadingMore,
    hasMore,
    error: error ? ((error as Error).message ?? 'Could not load notes.') : null,
    hasData: !!data,
    loadMore,
    reload,
    patchNote,
    removeNote,
    addNote,
  }
}
