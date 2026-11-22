import {
  PAGE_SIZE,
  type AppConfig,
  type Attachment,
  type Folder,
  type Id,
  type Note,
  type NotePatch,
  type NoteRevisionMeta,
  type NoteRevisionDetail,
  type NotesPage,
  type NotesQuery,
  type NotesView,
  type Session,
  type TwoFactorChallenge, type TwoFactorSetup, type AuthSession,
  type Tag,
  type UploadResult,
} from './types'
import { compressImage } from '@/utils/importers'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const UNAUTHORIZED_EVENT = 'inotion:unauthorized'

const SILENT_401 = ['/api/auth/login', '/api/auth/me', '/api/auth/change-password']

function defaultMessage(status: number): string {
  switch (status) {
    case 0:
      return "Can't reach the server. Check your connection and try again."
    case 400:
      return 'The server rejected that request.'
    case 401:
      return 'Your session has expired. Please sign in again.'
    case 403:
      return 'Request blocked. Reload the page and try again.'
    case 404:
      return 'Not found.'
    case 409:
      return 'This item was modified elsewhere.'
    case 413:
      return 'That request is too large for the server.'
    case 429:
      return 'Too many attempts. Please wait a moment and try again.'
    case 502:
      return 'The server could not finish the request (502). Please try again.'
    default:
      return status >= 500
        ? `The server had a problem (${status}). Please try again.`
        : `Request failed (${status}).`
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    if (!text) return ''
    try {
      const json = JSON.parse(text)
      const value = json?.error ?? json?.message ?? json?.detail
      if (typeof value === 'string') return value
      if (value && typeof value.message === 'string') return value.message
      return ''
    } catch {
      return text.length < 200 && !text.trim().startsWith('<') ? text : ''
    }
  } catch {
    return ''
  }
}

async function send(
  path: string,
  init: RequestInit = {},
): Promise<{ data: unknown; res: Response }> {
  const headers = new Headers(init.headers)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', 'application/json')

  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, defaultMessage(0))
  }

  if (!res.ok) {
    if (res.status === 401 && !SILENT_401.includes(path)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      }
    }
    const serverMessage = await readError(res)
    // Status-specific copy wins for statuses the UI explains itself.
    const message =
      res.status === 413 || res.status === 429
        ? defaultMessage(res.status)
        : serverMessage || defaultMessage(res.status)
    throw new ApiError(res.status, message)
  }

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  return { data, res }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await send(path, init)
  return data as T
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}

/* ------------------------------ auth ------------------------------ */

export const getConfig = () => request<AppConfig>('/api/config')

export const login = (email: string, password: string) =>
  request<Session | TwoFactorChallenge>('/api/auth/login', json('POST', { email, password }))
export const verify2FA = (challenge_token:string,code:string) => request<Session>('/api/auth/2fa/verify',json('POST',{challenge_token,code}))
export const setup2FA = () => request<TwoFactorSetup>('/api/auth/2fa/setup',{method:'POST'})
export const enable2FA = (data:{password:string;code:string}) => request<{recovery_codes:string[]}>('/api/auth/2fa/enable',json('POST',data))
export const disable2FA = (data:{password:string;code:string}) => request<{ok:boolean}>('/api/auth/2fa/disable',json('POST',data))
export const listSessions = () => request<AuthSession[]>('/api/auth/sessions')
export const revokeSession = (id:string) => request<{ok:boolean}>(`/api/auth/sessions/${encodeURIComponent(id)}`,{method:'DELETE'})
export const revokeOtherSessions = () => request<{ok:boolean;revoked_count:number}>('/api/auth/sessions/revoke-others',{method:'POST'})

/** Resolves to null when there is no active session (401). */
export async function getSession(): Promise<Session | null> {
  try {
    return await request<Session>('/api/auth/me')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

export const logout = () =>
  request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })

export const changePassword = (current_password: string, new_password: string) =>
  request<{ ok: boolean }>('/api/auth/change-password', json('POST', { current_password, new_password }))

/* ------------------------------ notes ------------------------------ */

/**
 * The contract only says "paginated list (50 notes/page)" with an offset
 * cursor, so this accepts either a bare array or an envelope containing the
 * array under `notes` / `items` / `data` plus `next_cursor` / `nextCursor`.
 */
function normalizePage(raw: unknown, cursor: number): NotesPage {
  const obj = (raw ?? {}) as Record<string, unknown>
  const list = Array.isArray(raw)
    ? (raw as Note[])
    : ((obj.notes ?? obj.items ?? obj.data ?? []) as Note[])
  const notes = Array.isArray(list) ? list : []

  const explicit = Array.isArray(raw)
    ? undefined
    : (obj.next_cursor ?? obj.nextCursor ?? obj.cursor)
  if (explicit === null) return { notes, nextCursor: null }
  if (explicit !== undefined && explicit !== '') {
    const n = Number(explicit)
    if (Number.isFinite(n) && n > cursor) return { notes, nextCursor: n }
    return { notes, nextCursor: null }
  }
  if (notes.length >= PAGE_SIZE) {
    return { notes, nextCursor: cursor + notes.length }
  }
  return { notes, nextCursor: null }
}

export async function listNotes(
  query: NotesQuery,
  cursor = 0,
): Promise<NotesPage> {
  const params = new URLSearchParams()
  // The Worker currently names these two views `archive` and `trash`.
  params.set('view', query.view === 'archived' ? 'archive' : query.view === 'trashed' ? 'trash' : query.view)
  if (query.folder) params.set('folder', String(query.folder))
  if (query.tag) params.set('tag', String(query.tag))
  const q = query.q?.trim()
  if (q) params.set('q', q)
  if (cursor > 0) params.set('cursor', String(cursor))
  const raw = await request<unknown>(`/api/notes?${params.toString()}`)
  return normalizePage(raw, cursor)
}

export const createNote = (body: {
  title: string
  body_md: string
  folder_id?: Id | null
}) => request<Note>('/api/notes', json('POST', body))

export const getNote = (id: Id) =>
  request<Note>(`/api/notes/${encodeURIComponent(String(id))}`)

export const patchNote = (id: Id, revision: number, patch: NotePatch) =>
  request<Note>(
    `/api/notes/${encodeURIComponent(String(id))}`,
    json('PATCH', { revision, ...patch }),
  )

export const deleteNote = (id: Id) =>
  request<{ ok: boolean }>(`/api/notes/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })

export const restoreNote = (id: Id) =>
  request<Note>(`/api/notes/${encodeURIComponent(String(id))}/restore`, {
    method: 'POST',
  })

export const listNoteRevisions = (id: Id) => request<NoteRevisionMeta[]>(`/api/notes/${encodeURIComponent(String(id))}/revisions`)
export const getNoteRevision = (id: Id, revId: string) => request<NoteRevisionDetail>(`/api/notes/${encodeURIComponent(String(id))}/revisions/${encodeURIComponent(revId)}`)
export const restoreNoteRevision = (id: Id, revId: string, current_revision: number) => request<Note>(`/api/notes/${encodeURIComponent(String(id))}/revisions/${encodeURIComponent(revId)}/restore`,json('POST',{current_revision}))

/* ----------------------------- folders ----------------------------- */

export const listFolders = () => request<Folder[]>('/api/folders')

export const createFolder = (name: string, parentId?: Id | null) =>
  request<Folder>(
    '/api/folders',
    json('POST', parentId != null ? { name, parent_id: parentId } : { name }),
  )

export async function updateFolder(id: Id, name: string, parentId: Id | null): Promise<Folder> {
  await request<unknown>(
    `/api/folders/${encodeURIComponent(String(id))}`,
    json('PATCH', { name, parent_id: parentId }),
  )
  return { ...(await listFolders()).find((folder) => String(folder.id) === String(id))!, name, parent_id: parentId }
}

export const deleteFolder = (id: Id) =>
  request<unknown>(`/api/folders/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })

/* ------------------------------- tags ------------------------------- */

export const listTags = () => request<Tag[]>('/api/tags')

export const createTag = (name: string) =>
  request<Tag>('/api/tags', json('POST', { name }))

export async function updateTag(id: Id, name: string): Promise<Tag> {
  await request<unknown>(
    `/api/tags/${encodeURIComponent(String(id))}`,
    json('PATCH', { name }),
  )
  return { ...(await listTags()).find((tag) => String(tag.id) === String(id))!, name }
}

export const deleteTag = (id: Id) =>
  request<{ ok: boolean }>(`/api/tags/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })

/* --------------------------- attachments --------------------------- */

export const listAttachments = (noteId: Id) =>
  request<Attachment[]>(
    `/api/notes/${encodeURIComponent(String(noteId))}/attachments`,
  )

export const attachmentUrl = (id: Id) =>
  `/api/attachments/${encodeURIComponent(String(id))}`

export async function uploadAttachment(
  noteId: Id,
  file: File,
): Promise<UploadResult> {
  file = await compressImage(file)
  const form = new FormData()
  form.append('file', file)
  const { data, res } = await send(
    `/api/notes/${encodeURIComponent(String(noteId))}/attachments`,
    { method: 'POST', body: form },
  )
  const obj = (data ?? {}) as Record<string, unknown>
  const warningRaw =
    obj.warning ??
    obj.quota_warning ??
    obj.storage_warning ??
    res.headers.get('x-storage-warning') ??
    res.headers.get('x-quota-warning')
  const warning =
    typeof warningRaw === 'string' && warningRaw
      ? warningRaw
      : warningRaw
        ? 'Storage is nearly full.'
        : null
  const attachment = (obj.attachment ?? (obj.id ? obj : null)) as Attachment | null
  return { attachment, warning }
}

export const deleteAttachment = (id: Id) =>
  request<{ ok: boolean }>(`/api/attachments/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })

export interface PresignedUpload { upload_url:string; object_key:string; expires_at:string; quota_warning?:boolean }
export const presignAttachment = (noteId:Id,file:File) => request<PresignedUpload>(`/api/notes/${encodeURIComponent(String(noteId))}/attachments/presign`,json('POST',{filename:file.name,content_type:file.type,byte_size:file.size}))
export const completeAttachment = (noteId:Id,file:File,object_key:string) => request<Attachment & {quota_warning?:boolean}>(`/api/notes/${encodeURIComponent(String(noteId))}/attachments/complete`,json('POST',{object_key,filename:file.name,content_type:file.type,byte_size:file.size}))
export async function uploadLargeAttachment(noteId:Id,file:File,onProgress?:(loaded:number,total:number)=>void) {
  file=await compressImage(file)
  const prepared=await presignAttachment(noteId,file)
  await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',prepared.upload_url);xhr.setRequestHeader('Content-Type',file.type);xhr.upload.onprogress=e=>onProgress?.(e.loaded,e.total||file.size);xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(`Storage upload failed (${xhr.status})`));xhr.onerror=()=>reject(new Error('Storage upload failed'));xhr.send(file)})
  const attachment=await completeAttachment(noteId,file,prepared.object_key)
  return {attachment,warning:prepared.quota_warning||attachment.quota_warning?'Storage is nearly full.':null}
}

/* ------------------------------ export ------------------------------ */

async function listAllNotes(view: NotesView): Promise<Note[]> {
  const all: Note[] = []
  let cursor = 0
  for (let guard = 0; guard < 10_000; guard++) {
    const page = await listNotes({ view }, cursor)
    all.push(...page.notes)
    if (page.nextCursor == null || page.nextCursor <= cursor) break
    cursor = page.nextCursor
  }
  return all
}

/** Client-side export: there is no backend export endpoint. */
export async function exportAllAsJson(): Promise<{ count: number }> {
  const [active, archived, trashed, folders, tags] = await Promise.all([
    listAllNotes('all'),
    listAllNotes('archived'),
    listAllNotes('trashed'),
    listFolders(),
    listTags(),
  ])
  const payload = {
    app: 'inotion-notes',
    exported_at: new Date().toISOString(),
    folders,
    tags,
    notes: { all: active, archived, trashed },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inotion-notes-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { count: active.length + archived.length + trashed.length }
}
