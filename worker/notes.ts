import { decryptText, encryptText, getEncryptionKey, ENC_PREFIX } from './crypto';
import type { SessionUser } from './auth';
import { maybeSnapshotNote } from './revisions';

export interface NotesEnv { DB: D1Database; ENCRYPTION_KEY?: string }
type NoteRow = { id:string; user_id:string; folder_id:string|null; title:string; body_md:string; is_pinned:number; archived_at:number|null; trashed_at:number|null; created_at:number; updated_at:number; revision:number };
const PAGE_SIZE = 50;
const MAX_BODY = 200_000;
const json = (value:unknown,status=200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const error = (message:string,status=400) => json({error:message},status);
const newId = () => crypto.randomUUID();
const parseBody = async (request:Request):Promise<Record<string,unknown>|null> => { try { const value=await request.json(); return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : null; } catch { return null; } };
const cleanName = (value:unknown) => typeof value==='string' ? value.trim().slice(0,100) : '';

async function tagsFor(db:D1Database,noteId:string) {
  const result=await db.prepare('SELECT t.id,t.name FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=? ORDER BY t.name').bind(noteId).all<{id:string;name:string}>();
  return result.results||[];
}
async function decode(row:NoteRow,key:CryptoKey,db:D1Database) {
  return {...row,body_md:await decryptText(row.body_md,key),is_pinned:!!row.is_pinned,tags:await tagsFor(db,row.id)};
}
function baseFilters(url:URL,user:SessionUser) {
  const where=['n.user_id=?'], args:unknown[]=[user.id];
  const view=url.searchParams.get('view')||'all';
  if(!['all','pinned','archive','trash'].includes(view)) throw new Error('Invalid view');
  if(view==='trash') where.push('n.trashed_at IS NOT NULL');
  else if(view==='archive') where.push('n.trashed_at IS NULL AND n.archived_at IS NOT NULL');
  else { where.push('n.trashed_at IS NULL AND n.archived_at IS NULL'); if(view==='pinned')where.push('n.is_pinned=1'); }
  const folder=url.searchParams.get('folder'), tag=url.searchParams.get('tag');
  if(folder){where.push('n.folder_id=?');args.push(folder);}
  if(tag){where.push('EXISTS(SELECT 1 FROM note_tags nt WHERE nt.note_id=n.id AND nt.tag_id=?)');args.push(tag);}
  return {where,args};
}
function safeFtsQuery(q:string) { return q.trim().split(/\s+/).filter(Boolean).map(word=>`"${word.replaceAll('"','""')}"*`).join(' AND '); }
async function readNote(db:D1Database,user:SessionUser,noteId:string,key:CryptoKey) {
  const row=await db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first<NoteRow>();
  if(!row)return error('Note not found',404);
  return json(await decode(row,key,db));
}
async function ownedFolder(db:D1Database,folderId:string,userId:string) {
  return db.prepare('SELECT id FROM folders WHERE id=? AND user_id=?').bind(folderId,userId).first();
}
async function listNotes(url:URL,env:NotesEnv,user:SessionUser) {
  const {where,args}=baseFilters(url,user), q=(url.searchParams.get('q')||'').trim();
  const cursorRaw=url.searchParams.get('cursor')||'0', offset=Number(cursorRaw);
  if(!Number.isSafeInteger(offset)||offset<0)return error('Invalid cursor');
  const key=await getEncryptionKey(env.ENCRYPTION_KEY);
  let rows:NoteRow[]=[];
  if(!q) {
    const result=await env.DB.prepare(`SELECT n.* FROM notes n WHERE ${where.join(' AND ')} ORDER BY n.is_pinned DESC,n.updated_at DESC,n.id LIMIT ? OFFSET ?`).bind(...args,PAGE_SIZE+1,offset).all<NoteRow>();
    rows=result.results||[];
  } else {
    const fts=safeFtsQuery(q), matched=new Map<string,NoteRow>();
    if(fts)try {
      const result=await env.DB.prepare(`SELECT n.* FROM notes_fts f JOIN notes n ON n.rowid=f.rowid WHERE notes_fts MATCH ? AND ${where.join(' AND ')} ORDER BY n.is_pinned DESC,n.updated_at DESC LIMIT 500`).bind(fts,...args).all<NoteRow>();
      for(const row of result.results||[])matched.set(row.id,row);
    } catch { /* punctuation-only or unsupported FTS input still gets body search */ }
    const encrypted=await env.DB.prepare(`SELECT n.* FROM notes n WHERE ${where.join(' AND ')} AND n.body_md LIKE ? ORDER BY n.is_pinned DESC,n.updated_at DESC LIMIT 500`).bind(...args,ENC_PREFIX+'%').all<NoteRow>();
    for(const row of encrypted.results||[]) {
      const body=await decryptText(row.body_md,key);
      if(body.toLocaleLowerCase().includes(q.toLocaleLowerCase()))matched.set(row.id,row);
    }
    rows=[...matched.values()].sort((a,b)=>b.is_pinned-a.is_pinned||b.updated_at-a.updated_at||a.id.localeCompare(b.id)).slice(offset,offset+PAGE_SIZE+1);
  }
  const hasMore=rows.length>PAGE_SIZE, page=rows.slice(0,PAGE_SIZE);
  const notes=await Promise.all(page.map(async row=>{
    const body=await decryptText(row.body_md,key);
    const normalized=body.replace(/[#>*_`\[\]()~-]/g,' ').replace(/\s+/g,' ').trim();
    const index=q?normalized.toLocaleLowerCase().indexOf(q.toLocaleLowerCase()):-1;
    const snippet=normalized.slice(index>=0?Math.max(0,index-60):0,(index>=0?Math.max(0,index-60):0)+180);
    return {...await decode(row,key,env.DB),snippet};
  }));
  return json({notes,nextCursor:hasMore?String(offset+PAGE_SIZE):null});
}

export async function handleNotes(request:Request,env:NotesEnv,user:SessionUser,path:string,url:URL):Promise<Response|null> {
  const db=env.DB;
  if(path==='/api/notes'&&request.method==='GET')return listNotes(url,env,user);
  if(path==='/api/notes'&&request.method==='POST') {
    const input=await parseBody(request); if(!input||typeof input.body_md!=='string'||input.body_md.length>MAX_BODY)return error('Invalid note');
    const folderId=typeof input.folder_id==='string'&&input.folder_id?input.folder_id:null;
    if(folderId&&!await ownedFolder(db,folderId,user.id))return error('Folder not found',404);
    const now=Date.now(),noteId=newId(),key=await getEncryptionKey(env.ENCRYPTION_KEY);
    await db.prepare('INSERT INTO notes(id,user_id,folder_id,title,body_md,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(noteId,user.id,folderId,typeof input.title==='string'?input.title.slice(0,500):'',await encryptText(input.body_md,key),now,now).run();
    return readNote(db,user,noteId,key).then(async response=>new Response(response.body,{status:201,headers:response.headers}));
  }
  if(path==='/api/notes/:id'&&request.method==='GET')return readNote(db,user,url.pathname.split('/').pop()!,await getEncryptionKey(env.ENCRYPTION_KEY));
  if(path==='/api/notes/:id'&&request.method==='PATCH') {
    const noteId=url.pathname.split('/').pop()!, input=await parseBody(request);
    if(!input)return error('Invalid JSON body');
    const row=await db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first<NoteRow>();
    if(!row)return error('Note not found',404);
    if(Number(input.revision)!==row.revision)return error('Revision conflict',409);
    if(input.body_md!==undefined&&(typeof input.body_md!=='string'||input.body_md.length>MAX_BODY))return error('Invalid note body');
    const nextTitle=input.title===undefined?row.title:(typeof input.title==='string'?input.title.slice(0,500):row.title);
    const contentChanged=nextTitle!==row.title||(input.body_md!==undefined&&input.body_md!==await decryptText(row.body_md,await getEncryptionKey(env.ENCRYPTION_KEY)));
    if(contentChanged||input.force_snapshot===true)await maybeSnapshotNote(env,db,row,{force:input.force_snapshot===true});
    const folderId=input.folder_id===undefined?row.folder_id:(typeof input.folder_id==='string'&&input.folder_id?input.folder_id:null);
    if(folderId&&!await ownedFolder(db,folderId,user.id))return error('Folder not found',404);
    const key=await getEncryptionKey(env.ENCRYPTION_KEY),now=Date.now();
    await db.prepare('UPDATE notes SET title=?,body_md=?,folder_id=?,is_pinned=?,archived_at=?,trashed_at=?,updated_at=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=?')
      .bind(input.title===undefined?row.title:(typeof input.title==='string'?input.title.slice(0,500):row.title),input.body_md===undefined?row.body_md:await encryptText(input.body_md,key),folderId,input.is_pinned===undefined?row.is_pinned:(input.is_pinned?1:0),input.archived_at===undefined?row.archived_at:(Number(input.archived_at)||null),input.trashed_at===undefined?row.trashed_at:(Number(input.trashed_at)||null),now,noteId,user.id,row.revision).run();
    if(Array.isArray(input.tag_ids)) {
      const ids=[...new Set(input.tag_ids.filter((x):x is string=>typeof x==='string'))].slice(0,50);
      await db.prepare('DELETE FROM note_tags WHERE note_id=?').bind(noteId).run();
      for(const tagId of ids)await db.prepare('INSERT OR IGNORE INTO note_tags(note_id,tag_id) SELECT ?,id FROM tags WHERE id=? AND user_id=?').bind(noteId,tagId,user.id).run();
    }
    return readNote(db,user,noteId,key);
  }
  if(path==='/api/notes/:id'&&request.method==='DELETE') {
    const noteId=url.pathname.split('/').pop()!;
    await db.prepare('DELETE FROM note_revisions WHERE note_id=? AND user_id=?').bind(noteId,user.id).run();
    const result=await db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).run();
    if(result.meta.changes) try { await db.prepare("INSERT INTO sync_tombstones(id,user_id,entity_type,entity_id,deleted_at) VALUES(?,?,'note',?,?)").bind(newId(),user.id,noteId,Date.now()).run(); } catch { /* Older local databases may not have applied migration 0008 yet. */ }
    return result.meta.changes?json({ok:true}):error('Note not found',404);
  }
  if(path==='/api/notes/:id/restore'&&request.method==='POST') {
    const noteId=url.pathname.split('/').filter(Boolean).at(-2)!,exists=await db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first();
    if(!exists)return error('Note not found',404);
    await db.prepare('UPDATE notes SET trashed_at=NULL,archived_at=NULL,updated_at=?,revision=revision+1 WHERE id=? AND user_id=?').bind(Date.now(),noteId,user.id).run();
    return readNote(db,user,noteId,await getEncryptionKey(env.ENCRYPTION_KEY));
  }
  if(path==='/api/folders'&&request.method==='GET')return json((await db.prepare('SELECT id,name,parent_id,position,created_at,updated_at FROM folders WHERE user_id=? ORDER BY position,name').bind(user.id).all()).results||[]);
  if(path==='/api/folders'&&request.method==='POST') {
    const input=await parseBody(request),name=cleanName(input?.name);if(!input||!name)return error('Name required');
    const parentId=typeof input.parent_id==='string'&&input.parent_id?input.parent_id:null;
    if(parentId&&!await ownedFolder(db,parentId,user.id))return error('Parent folder not found',404);
    const now=Date.now(),folderId=newId();await db.prepare('INSERT INTO folders(id,user_id,name,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(folderId,user.id,name,parentId,now,now).run();
    return json({id:folderId,name,parent_id:parentId,created_at:now,updated_at:now},201);
  }
  if(path.startsWith('/api/folders/')&&request.method==='PATCH') {
    const folderId=url.pathname.split('/').pop()!,input=await parseBody(request),name=cleanName(input?.name);if(!input||!name)return error('Name required');
    const existing=await db.prepare('SELECT parent_id FROM folders WHERE id=? AND user_id=?').bind(folderId,user.id).first<{parent_id:string|null}>();if(!existing)return error('Folder not found',404);
    const parentId=typeof input.parent_id==='string'&&input.parent_id?input.parent_id:(input.parent_id===null?null:existing.parent_id);
    if(parentId&&!await ownedFolder(db,parentId,user.id))return error('Parent folder not found',404);
    let current=parentId;for(let depth=0;current&&depth<100;depth++){if(current===folderId)return error('Folder cycle');const next=await db.prepare('SELECT parent_id FROM folders WHERE id=? AND user_id=?').bind(current,user.id).first<{parent_id:string|null}>();current=next?.parent_id||null;}
    if(current)return error('Folder nesting limit exceeded');
    await db.prepare('UPDATE folders SET name=?,parent_id=?,updated_at=? WHERE id=? AND user_id=?').bind(name,parentId,Date.now(),folderId,user.id).run();return json({ok:true});
  }
  if(path.startsWith('/api/folders/')&&request.method==='DELETE') {
    const folderId=url.pathname.split('/').pop()!,exists=await ownedFolder(db,folderId,user.id);if(!exists)return error('Folder not found',404);
    await db.prepare('UPDATE notes SET folder_id=NULL,updated_at=?,revision=revision+1 WHERE folder_id=? AND user_id=?').bind(Date.now(),folderId,user.id).run();
    await db.prepare('UPDATE folders SET parent_id=NULL,updated_at=? WHERE parent_id=? AND user_id=?').bind(Date.now(),folderId,user.id).run();
    await db.prepare('DELETE FROM folders WHERE id=? AND user_id=?').bind(folderId,user.id).run();return json({ok:true});
  }
  if(path==='/api/tags'&&request.method==='GET')return json((await db.prepare('SELECT t.id,t.name,t.created_at,COUNT(nt.note_id) AS note_count FROM tags t LEFT JOIN note_tags nt ON nt.tag_id=t.id WHERE t.user_id=? GROUP BY t.id ORDER BY t.name').bind(user.id).all()).results||[]);
  if(path==='/api/tags'&&request.method==='POST') {
    const input=await parseBody(request),name=cleanName(input?.name);if(!input||!name)return error('Name required');const tagId=newId(),now=Date.now();
    await db.prepare('INSERT INTO tags(id,user_id,name,created_at) VALUES(?,?,?,?)').bind(tagId,user.id,name,now).run();return json({id:tagId,name,created_at:now,note_count:0},201);
  }
  if(path.startsWith('/api/tags/')&&request.method==='PATCH') {
    const tagId=url.pathname.split('/').pop()!,input=await parseBody(request),name=cleanName(input?.name);if(!input||!name)return error('Name required');
    const result=await db.prepare('UPDATE tags SET name=? WHERE id=? AND user_id=?').bind(name,tagId,user.id).run();return result.meta.changes?json({ok:true}):error('Tag not found',404);
  }
  if(path.startsWith('/api/tags/')&&request.method==='DELETE') {
    const result=await db.prepare('DELETE FROM tags WHERE id=? AND user_id=?').bind(url.pathname.split('/').pop(),user.id).run();return result.meta.changes?json({ok:true}):error('Tag not found',404);
  }
  return null;
}
