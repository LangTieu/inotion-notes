import * as db from './db'

const PREF = 'inotion-offline-cache'
export const cacheEnabled = () => localStorage.getItem(PREF) !== 'off'
export async function setCacheEnabled(enabled: boolean) {
  localStorage.setItem(PREF, enabled ? 'on' : 'off')
  if (!enabled) await db.clearAllOfflineData()
  window.dispatchEvent(new Event('inotion:sync-status'))
}
export async function wipeOfflineData() { await db.clearAllOfflineData() }
const status = (value: string) => window.dispatchEvent(new CustomEvent('inotion:sync-status', { detail: value }))

async function send(path: string, init: RequestInit = {}) {
  let response: Response
  try { response = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }) }
  catch { return new Response(null, { status: 503, statusText: 'Network unavailable' }) }
  if (response.status === 401) {
    await db.clearAllOfflineData()
    window.dispatchEvent(new Event('inotion:unauthorized'))
  }
  return response
}

export async function cachedList(store: 'notes' | 'folders' | 'tags') { return db.all(store) }

export async function enqueueNote(type: 'create' | 'patch' | 'delete' | 'restore', id: string, body?: any) {
  if (!cacheEnabled()) throw new Error('Offline cache is disabled')
  const note = type === 'create' ? { ...body, id, created_at: Date.now(), updated_at: Date.now(), revision: 1, tags: [] } : await db.get('notes', id)
  if (type === 'create' || note) {
    if (type === 'delete') await db.remove('notes', id)
    else await db.put('notes', { ...note, ...body, id, updated_at: Date.now() })
  }
  return db.enqueue({ type, entity: 'note', entityId: id, body })
}

export async function enqueueEntity(entity: 'folder' | 'tag', type: 'create' | 'patch' | 'delete', id: string, body?: any) {
  if (!cacheEnabled()) throw new Error('Offline cache is disabled')
  const store = entity === 'folder' ? 'folders' : 'tags', existing = await db.get(store, id)
  if (type === 'delete') await db.remove(store, id)
  else await db.put(store, { ...existing, ...body, id, created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() })
  return db.enqueue({ type, entity, entityId: id, body })
}

let running = false
const nextUnpaused = async () => (await db.all<db.QueueItem>('outbox')).filter(item => !item.paused).sort((a, b) => a.sequence - b.sequence)[0]

async function remapTemporaryId(oldId: string, newId: string, store: 'notes' | 'folders' | 'tags', serverValue: any) {
  const existing = await db.get(store, oldId)
  if (existing) await db.remove(store, oldId)
  await db.put(store, { ...existing, ...serverValue, id: newId })
  const replace = (value: any): any => value === oldId ? newId : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value
  for (const name of ['notes', 'folders', 'tags'] as const) for (const value of await db.all<any>(name)) {
    if (value.id !== newId) {
      const mapped = replace(value)
      if (JSON.stringify(mapped) !== JSON.stringify(value)) await db.put(name, mapped)
    }
  }
  for (const queued of await db.all<db.QueueItem>('outbox')) {
    const entityId = queued.entityId === oldId ? newId : queued.entityId, body = queued.body ? replace(queued.body) : queued.body
    if (entityId !== queued.entityId || JSON.stringify(body) !== JSON.stringify(queued.body)) await db.updateOutbox({ ...queued, entityId, body })
  }
}

export async function syncNow() {
  if (!cacheEnabled() || !navigator.onLine || running) return
  running = true
  status('syncing')
  try {
    let item = await nextUnpaused()
    while (item) {
      // The preference can change while a request is in flight. Do not let a
      // completed replay repopulate IndexedDB after the user has disabled it.
      if (!cacheEnabled()) return
      const root = item.entity === 'note' ? 'notes' : item.entity === 'folder' ? 'folders' : 'tags'
      const path = item.type === 'create' ? `/api/${root}` : `/api/${root}/${encodeURIComponent(item.entityId)}${item.type === 'restore' ? '/restore' : ''}`
      const method = item.type === 'create' ? 'POST' : item.type === 'patch' ? 'PATCH' : item.type === 'delete' ? 'DELETE' : 'POST'
      const response = await send(path, { method, ...(['POST', 'PATCH'].includes(method) ? { body: JSON.stringify(item.body || {}) } : {}) })
      if (!cacheEnabled()) return
      if (response.status === 409) {
        await db.updateOutbox({ ...item, paused: true })
        status('conflict')
        if (item.entity === 'note') window.dispatchEvent(new CustomEvent('inotion:offline-conflict', { detail: { noteId: item.entityId, outboxId: item.id } }))
        item = await nextUnpaused()
        continue
      }
      if (!response.ok) break
      const result = method === 'DELETE' ? {} : await response.json().catch(() => ({}))
      if (item.type === 'create' && result.id) await remapTemporaryId(item.entityId, result.id, root, result)
      else if (result.id && item.entity === 'note') await db.put('notes', result)
      await db.dequeue(item.id)
      item = await nextUnpaused()
    }
    const since = Number((await db.get<any>('meta', 'last_sync_at'))?.value || 0)
    let more = true, offset = 0, serverTime = since
    while (more) {
      if (!cacheEnabled()) return
      const response = await send(`/api/sync?since=${since}&offset=${offset}`)
      if (!cacheEnabled()) return
      if (!response.ok) break
      const delta = await response.json()
      // Keep optimistic drafts authoritative until their queued mutation resolves.
      // In particular, a pull immediately after a 409 must not replace the draft
      // that the conflict dialog is asking the user to reload or overwrite.
      const pending = await db.all<db.QueueItem>('outbox')
      const pendingIds = new Set(pending.map(queued => `${queued.entity}:${queued.entityId}`))
      for (const note of delta.notes) if (!pendingIds.has(`note:${note.id}`)) await db.put('notes', note)
      for (const folder of delta.folders) if (!pendingIds.has(`folder:${folder.id}`)) await db.put('folders', folder)
      for (const tag of delta.tags) if (!pendingIds.has(`tag:${tag.id}`)) await db.put('tags', tag)
      for (const id of delta.deleted_note_ids) if (!pendingIds.has(`note:${id}`)) await db.remove('notes', id)
      serverTime = delta.server_time
      more = !!delta.has_more
      offset += 200
    }
    if (offset > 0) await db.put('meta', { id: 'last_sync_at', value: serverTime })
  } finally {
    running = false
    const queue = await db.all<db.QueueItem>('outbox')
    status(!navigator.onLine ? `offline:${queue.length}` : queue.length ? `offline:${queue.length}` : 'synced')
  }
}

export async function resolveConflict(id: string, choice: 'reload' | 'overwrite', latest?: any) {
  if (choice === 'reload' && latest) await db.put('notes', latest)
  await db.dequeue(id)
  void syncNow()
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void syncNow())
