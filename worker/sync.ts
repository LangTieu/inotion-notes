import type { SessionUser } from './auth';
import { decryptText, getEncryptionKey } from './crypto';

export interface SyncEnv { DB: D1Database; ENCRYPTION_KEY?: string }
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function handleSync(request: Request, env: SyncEnv, user: SessionUser): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/sync' || request.method !== 'GET') return null;
  const rawSince = new URL(request.url).searchParams.get('since') || '0';
  const since = Number(rawSince);
  if (!Number.isSafeInteger(since) || since < 0) return new Response(JSON.stringify({ error: 'Invalid since' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const rawOffset = new URL(request.url).searchParams.get('offset') || '0';
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset < 0) return new Response(JSON.stringify({ error: 'Invalid offset' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const candidates = await env.DB.prepare(`SELECT kind,id,changed_at FROM (
    SELECT 'note' kind,id,updated_at changed_at FROM notes WHERE user_id=? AND updated_at>?
    UNION ALL SELECT 'folder',id,updated_at FROM folders WHERE user_id=? AND updated_at>?
    UNION ALL SELECT 'tag',id,created_at FROM tags WHERE user_id=? AND created_at>?
    UNION ALL SELECT 'deleted',entity_id,deleted_at FROM sync_tombstones WHERE user_id=? AND entity_type='note' AND deleted_at>?
  ) ORDER BY changed_at,id LIMIT 201 OFFSET ?`).bind(user.id,since,user.id,since,user.id,since,user.id,since,offset).all<{kind:string;id:string;changed_at:number}>();
  const rows = candidates.results || [], has_more = rows.length > 200, page = rows.slice(0,200);
  const key = await getEncryptionKey(env.ENCRYPTION_KEY), notes: unknown[] = [], folders: unknown[] = [], tags: unknown[] = [], deleted_note_ids: string[] = [];
  for (const row of page) {
    if (row.kind === 'deleted') { deleted_note_ids.push(row.id); continue; }
    if (row.kind === 'note') {
      const note = await env.DB.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').bind(row.id,user.id).first<any>();
      if (note) {
        note.body_md = await decryptText(note.body_md,key); note.is_pinned = !!note.is_pinned;
        note.tags = (await env.DB.prepare('SELECT t.id,t.name FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=? AND t.user_id=?').bind(row.id,user.id).all()).results || [];
        notes.push(note);
      }
    } else if (row.kind === 'folder') {
      const item = await env.DB.prepare('SELECT id,name,parent_id,position,created_at,updated_at FROM folders WHERE id=? AND user_id=?').bind(row.id,user.id).first(); if(item) folders.push(item);
    } else {
      const item = await env.DB.prepare('SELECT id,name,created_at FROM tags WHERE id=? AND user_id=?').bind(row.id,user.id).first(); if(item) tags.push(item);
    }
  }
  return json({ server_time: Date.now(), notes, folders, tags, deleted_note_ids, has_more });
}
