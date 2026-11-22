import type { SessionUser } from './auth';
import { deleteB2, getB2, putB2, type B2Env } from './b2';

export interface AttachmentEnv extends B2Env { DB: D1Database; }
const MAX_PER_NOTE = 25 * 1024 * 1024, QUOTA_WARNING = 7 * 1024 * 1024 * 1024, MAX_FILE = 25 * 1024 * 1024;
const TYPE_BY_EXT: Record<string,string[]> = { jpg:['image/jpeg'],jpeg:['image/jpeg'],png:['image/png'],gif:['image/gif'],webp:['image/webp'],pdf:['application/pdf'],txt:['text/plain'],md:['text/markdown','text/plain'],zip:['application/zip'],json:['application/json'] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store' } });
const cleanFilename = (value: string) => value.replace(/[\\/\r\n\0]/g, '_').replace(/[";]/g, '_').trim().slice(0,180) || 'attachment';
const safeType = (file: File) => {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const type = file.type.toLowerCase();
  return TYPE_BY_EXT[ext]?.includes(type) ? type : null;
};
const dispositionFilename = (value:string) => cleanFilename(value).replace(/[^\x20-\x7e]/g,'_');

async function quotaWarning(env: AttachmentEnv) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(byte_size),0) AS total FROM attachments').first<{total:number}>();
  return Number(row?.total || 0) >= QUOTA_WARNING;
}

export async function handleAttachments(request: Request, env: AttachmentEnv, user: SessionUser, path: string, url: URL): Promise<Response|null> {
  const db = env.DB;
  const uploadMatch = path.match(/^\/api\/notes\/([^/]+)\/attachments$/);
  if (uploadMatch && request.method === 'GET') {
    const noteId = uploadMatch[1];
    const owned = await db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first();
    if (!owned) return json({error:'Note not found'},404);
    const result = await db.prepare('SELECT id,note_id,filename,content_type,byte_size,created_at FROM attachments WHERE note_id=? AND user_id=? ORDER BY created_at').bind(noteId,user.id).all();
    return json(result.results||[]);
  }
  if (uploadMatch && request.method === 'POST') {
    const noteId = uploadMatch[1];
    const owned = await db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first();
    if (!owned) return json({error:'Note not found'},404);
    let form: FormData;
    try { form = await request.formData(); } catch { return json({error:'Invalid multipart upload'},400); }
    const item = form.get('file');
    if (!(item instanceof File)) return json({error:'File is required'},400);
    if (item.size <= 0 || item.size > MAX_FILE) return json({error:'File exceeds the 25 MB limit'},413);
    const contentType = safeType(item);
    if (!contentType) return json({error:'File type is not allowed'},415);
    const current = await db.prepare('SELECT COALESCE(SUM(byte_size),0) AS total FROM attachments WHERE note_id=? AND user_id=?').bind(noteId,user.id).first<{total:number}>();
    if (Number(current?.total || 0) + item.size > MAX_PER_NOTE) return json({error:'Attachments exceed the 25 MB per note limit'},413);
    const id = crypto.randomUUID(), objectKey = `${user.id}/${noteId}/${crypto.randomUUID()}`, filename = cleanFilename(item.name);
    try { await putB2(env,objectKey,new Uint8Array(await item.arrayBuffer()),contentType); }
    catch { return json({error:'Attachment storage is unavailable'},502); }
    try {
      await db.prepare('INSERT INTO attachments(id,user_id,note_id,object_key,filename,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,user.id,noteId,objectKey,filename,contentType,item.size,Date.now()).run();
    } catch {
      try { await deleteB2(env,objectKey); } catch { return json({error:'Metadata save failed and storage cleanup needs attention'},502); }
      return json({error:'Could not save attachment metadata'},500);
    }
    const warning = await quotaWarning(env).catch(()=>false);
    return json({id,note_id:noteId,filename,content_type:contentType,byte_size:item.size,created_at:Date.now(),quotaWarning:warning},201);
  }
  const match = path.match(/^\/api\/attachments\/([^/]+)$/);
  if (!match) return null;
  const id = match[1];
  const row = await db.prepare('SELECT * FROM attachments WHERE id=? AND user_id=?').bind(id,user.id).first<{id:string;user_id:string;note_id:string;object_key:string;filename:string;content_type:string;byte_size:number;created_at:number}>();
  if (!row) return json({error:'Attachment not found'},404);
  if (request.method === 'GET') {
    let object: Response;
    try { object = await getB2(env,row.object_key); } catch { return json({error:'Attachment storage is unavailable'},502); }
    const safeInline = row.content_type.startsWith('image/');
    return new Response(object.body,{headers:{'Content-Type':row.content_type,'Content-Length':String(row.byte_size),'Content-Disposition':`${safeInline?'inline':'attachment'}; filename="${dispositionFilename(row.filename)}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  }
  if (request.method === 'DELETE') {
    try { await deleteB2(env,row.object_key); } catch { return json({error:'Could not delete attachment from storage'},502); }
    await db.prepare('DELETE FROM attachments WHERE id=? AND user_id=?').bind(id,user.id).run();
    return json({ok:true});
  }
  return null;
}

export async function deleteNoteAttachments(env: AttachmentEnv, user: SessionUser, noteId: string) {
  const rows = await env.DB.prepare('SELECT id,object_key FROM attachments WHERE note_id=? AND user_id=?').bind(noteId,user.id).all<{id:string;object_key:string}>();
  for (const row of rows.results || []) await deleteB2(env,row.object_key);
  await env.DB.prepare('DELETE FROM attachments WHERE note_id=? AND user_id=?').bind(noteId,user.id).run();
}
