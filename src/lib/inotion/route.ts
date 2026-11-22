import { useMemo, useSyncExternalStore } from 'react'
import type { Id, Note, NotesQuery, NotesView } from './types'

export type RouteKind =
  | 'notes'
  | 'pinned'
  | 'archived'
  | 'trash'
  | 'folder'
  | 'tag'
  | 'search'

export interface SearchScope {
  view: NotesView
  folder?: string
  tag?: string
}

export interface Route {
  kind: RouteKind
  /** Folder or tag id for `folder` / `tag` routes. */
  id?: string
  /** Currently open note. */
  noteId?: string
  /** Search text (search route only). */
  q?: string
  /** What a search is scoped to (search route only). */
  scope?: SearchScope
}

export function parseRoute(path: string, search = ''): Route {
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent)
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const noteParam = params.get('note') || undefined
  const [head, second] = segments

  switch (head) {
    case 'notes':
      return { kind: 'notes', noteId: second || noteParam }
    case 'pinned':
      return { kind: 'pinned', noteId: noteParam }
    case 'archived':
      return { kind: 'archived', noteId: noteParam }
    case 'trash':
      return { kind: 'trash', noteId: noteParam }
    case 'folder':
      return second
        ? { kind: 'folder', id: second, noteId: noteParam }
        : { kind: 'notes' }
    case 'tag':
      return second
        ? { kind: 'tag', id: second, noteId: noteParam }
        : { kind: 'notes' }
    case 'search': {
      const view = params.get('view')
      const scope: SearchScope = {
        view: view === 'archived' || view === 'trashed' ? view : 'all',
        folder: params.get('folder') || undefined,
        tag: params.get('tag') || undefined,
      }
      return {
        kind: 'search',
        q: params.get('q') ?? '',
        noteId: noteParam,
        scope,
      }
    }
    default:
      return { kind: 'notes' }
  }
}

export function routeToUrl(route: Route): string {
  const enc = encodeURIComponent
  const params = new URLSearchParams()
  let path: string

  switch (route.kind) {
    case 'notes':
      path = route.noteId ? `/notes/${enc(route.noteId)}` : '/notes'
      break
    case 'pinned':
      path = '/pinned'
      break
    case 'archived':
      path = '/archived'
      break
    case 'trash':
      path = '/trash'
      break
    case 'folder':
      path = `/folder/${enc(route.id ?? '')}`
      break
    case 'tag':
      path = `/tag/${enc(route.id ?? '')}`
      break
    case 'search': {
      path = '/search'
      if (route.q) params.set('q', route.q)
      if (route.scope?.view && route.scope.view !== 'all') {
        params.set('view', route.scope.view)
      }
      if (route.scope?.folder) params.set('folder', route.scope.folder)
      if (route.scope?.tag) params.set('tag', route.scope.tag)
      break
    }
  }
  if (route.kind !== 'notes' && route.noteId) params.set('note', route.noteId)
  const qs = params.toString()
  return `${path}${qs ? `?${qs}` : ''}`
}

function redirectLegacyHash() {
  if (window.location.hash.startsWith('#/')) {
    const route = parseRoute(window.location.hash.slice(1).split('?')[0], window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?') + 1) : '')
    window.history.replaceState(null, '', routeToUrl(route))
  }
}

if (typeof window !== 'undefined') redirectLegacyHash()

export function navigate(route: Route, options?: { replace?: boolean }) {
  const url = routeToUrl(route)
  if (options?.replace) {
    window.history.replaceState(null, '', url)
  } else {
    window.history.pushState(null, '', url)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}

export function useRoute(): Route {
  const url = useSyncExternalStore(
    subscribe,
    () => `${window.location.pathname}${window.location.search}`,
    () => '',
  )
  return useMemo(() => parseRoute(window.location.pathname, window.location.search), [url])
}

export const withNote = (route: Route, noteId: Id): Route => ({
  ...route,
  noteId: String(noteId),
})

export const withoutNote = (route: Route): Route => {
  const { noteId: _noteId, ...rest } = route
  return rest
}

/** The list route a search was opened from (used by the back button). */
export function scopeToRoute(scope: SearchScope | undefined): Route {
  if (!scope) return { kind: 'notes' }
  if (scope.view === 'archived') return { kind: 'archived' }
  if (scope.view === 'trashed') return { kind: 'trash' }
  if (scope.folder) return { kind: 'folder', id: scope.folder }
  if (scope.tag) return { kind: 'tag', id: scope.tag }
  return { kind: 'notes' }
}

export function routeToScope(route: Route): SearchScope {
  switch (route.kind) {
    case 'archived':
      return { view: 'archived' }
    case 'trash':
      return { view: 'trashed' }
    case 'folder':
      return { view: 'all', folder: route.id }
    case 'tag':
      return { view: 'all', tag: route.id }
    case 'search':
      return route.scope ?? { view: 'all' }
    default:
      return { view: 'all' }
  }
}

export function openSearchRoute(from: Route): Route {
  if (from.kind === 'search') return { ...from, noteId: undefined }
  return { kind: 'search', q: '', scope: routeToScope(from) }
}

/** The backend query for a route, or null when nothing should be fetched. */
export function routeToQuery(route: Route): NotesQuery | null {
  switch (route.kind) {
    case 'notes':
    case 'pinned':
      return { view: 'all' }
    case 'archived':
      return { view: 'archived' }
    case 'trash':
      return { view: 'trashed' }
    case 'folder':
      return { view: 'all', folder: route.id }
    case 'tag':
      return { view: 'all', tag: route.id }
    case 'search': {
      const q = route.q?.trim()
      if (!q) return null
      return { ...(route.scope ?? { view: 'all' }), q }
    }
  }
}

/** Does a note (after a local change) still belong in the list for a route? */
export function noteBelongsToRoute(note: Note, route: Route): boolean {
  const scope: SearchScope =
    route.kind === 'search' ? (route.scope ?? { view: 'all' }) : routeToScope(route)
  if (route.kind === 'pinned' && !note.is_pinned) return false
  if (scope.view === 'trashed') return !!note.trashed_at
  if (note.trashed_at) return false
  if (scope.view === 'archived') return !!note.archived_at
  if (note.archived_at) return false
  if (scope.folder && String(note.folder_id) !== scope.folder) return false
  if (scope.tag && !note.tags.some((t) => String(t.id) === scope.tag)) {
    return false
  }
  return true
}
