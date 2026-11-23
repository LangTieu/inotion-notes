export type Id = string | number

export interface NoteTag {
  id: Id
  name: string
}

export interface Note {
  id: Id
  short_code?: string
  folder_id: Id | null
  title: string
  body_md: string
  is_pinned: boolean
  archived_at: string | null
  trashed_at: string | null
  created_at: string
  updated_at: string
  reminder_at?: number | null
  revision: number
  tags: NoteTag[]
  /** Optional: only present if the backend chooses to include them. */
  attachment_count?: number
  has_attachments?: boolean
}

export interface Folder {
  id: Id
  name: string
  parent_id: Id | null
  position: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: Id
  name: string
  created_at: string
  note_count: number
}

export interface Attachment {
  id: Id
  filename: string
  content_type: string
  byte_size: number
  created_at: string
}

export type NotesView = 'all' | 'archived' | 'trashed'

export interface NotesQuery {
  view: NotesView
  folder?: string | null
  tag?: string | null
  q?: string
}

export interface NotesPage {
  notes: Note[]
  /** Offset to pass as `cursor` for the next page, or null when exhausted. */
  nextCursor: number | null
}

export interface Session { email: string; totp_enabled?: boolean }
export interface TwoFactorChallenge { requires_2fa: true; challenge_token: string }
export interface TwoFactorSetup { otpauth_uri: string; secret_base32: string }
export interface AuthSession { session_id:string; user_agent:string|null; created_at:number; last_seen_at:number; expires_at:number; is_current:boolean }

export interface AppConfig {
  app: string
  auth: string
}

export interface NotePatch {
  title?: string
  body_md?: string
  folder_id?: Id | null
  is_pinned?: boolean
  archived_at?: string | null
  trashed_at?: string | null
  tag_ids?: Id[]
  force_snapshot?: boolean
  reminder_at?: number | null
}

export interface NoteRevisionMeta { id: string; revision: number; title: string; created_at: number; byte_length: number }
export interface NoteRevisionDetail extends NoteRevisionMeta { body_md: string }

export interface UploadResult {
  attachment: Attachment | null
  /** Storage quota warning reported by the backend, if any. */
  warning: string | null
}

export interface AsyncList<T> {
  data: T[] | undefined
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

export const PAGE_SIZE = 50
export const MAX_TITLE = 500
export const MAX_BODY = 200_000
export const MAX_TAGS_PER_NOTE = 50
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 * 1024
