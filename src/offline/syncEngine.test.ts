import { beforeEach, describe, expect, it, vi } from 'vitest'

const stores = new Map<string, Map<string, any>>()
vi.mock('./db', () => {
  const store = (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name)! }
  return {
    all: async (name: string) => [...store(name).values()],
    get: async (name: string, id: string) => store(name).get(id),
    put: async (name: string, value: any) => { store(name).set(value.id, structuredClone(value)) },
    remove: async (name: string, id: string) => { store(name).delete(id) },
    enqueue: async (item: any) => { const queue = store('outbox'), value = { ...item, id: `q${queue.size + 1}`, sequence: queue.size + 1 }; queue.set(value.id, value); return value },
    peekOutbox: async () => [...store('outbox').values()].sort((a,b) => a.sequence-b.sequence)[0],
    dequeue: async (id: string) => { store('outbox').delete(id) },
    updateOutbox: async (item: any) => { store('outbox').set(item.id, item) },
    clearAllOfflineData: async () => { for (const value of stores.values()) value.clear() },
  }
})
import * as db from './db'
import { enqueueNote, syncNow, wipeOfflineData } from './syncEngine'

beforeEach(() => {
  stores.clear()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), clear: vi.fn() })
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('fetch', vi.fn())
})

describe('offline sync engine', () => {
  it('replays create then edit in FIFO order and remaps temporary IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'server-1', title: 'Draft' }), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'server-1', title: 'Edited' }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ server_time: 10, notes: [], folders: [], tags: [], deleted_note_ids: [], has_more: false }), { status: 200 })))
    await enqueueNote('create', 'tmp_note', { title: 'Draft', body_md: '' })
    await enqueueNote('patch', 'tmp_note', { revision: 1, title: 'Edited' })
    await syncNow()
    const calls = vi.mocked(fetch).mock.calls.map(call => String(call[0]))
    expect(calls.slice(0, 2)).toEqual(['/api/notes', '/api/notes/server-1'])
    expect(await db.get('notes', 'server-1')).toMatchObject({ id: 'server-1', title: 'Edited' })
    expect(await db.all('outbox')).toHaveLength(0)
  })

  it('pauses a 409 item and retains the local draft for conflict resolution', async () => {
    const listener = vi.fn()
    window.addEventListener('inotion:offline-conflict', listener)
    await db.put('notes', { id: 'n1', title: 'My draft', body_md: 'local' })
    await enqueueNote('patch', 'n1', { revision: 1, title: 'My draft' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 409 })).mockResolvedValueOnce(new Response(JSON.stringify({ server_time: 1, notes: [{ id: 'n1', title: 'Server copy', body_md: 'server' }], folders: [], tags: [], deleted_note_ids: [], has_more: false }), { status: 200 })))
    await syncNow()
    expect((await db.all<any>('outbox'))[0].paused).toBe(true)
    expect(await db.get('notes', 'n1')).toMatchObject({ title: 'My draft', body_md: 'local' })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('wipes every store after a 401 response', async () => {
    for (const name of ['notes','folders','tags','outbox','meta']) await db.put(name as any, { id: 'x' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    await syncNow()
    for (const name of ['notes','folders','tags','outbox','meta']) expect(await db.all(name as any)).toHaveLength(0)
  })

  it('wipes every store on logout', async () => {
    for (const name of ['notes','folders','tags','outbox','meta']) await db.put(name as any, { id: 'x' })
    await wipeOfflineData()
    for (const name of ['notes','folders','tags','outbox','meta']) expect(await db.all(name as any)).toHaveLength(0)
  })
})
