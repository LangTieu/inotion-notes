import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { generateShortCode, handleNotes } from './notes';
import type { SessionUser } from './auth';

const secret=btoa('01234567890123456789012345678901');
const userA:SessionUser={id:'user-a',email:'a@example.test'}, userB:SessionUser={id:'user-b',email:'b@example.test'};
let sqlite:any, db:D1Database;
const env=()=>({DB:db,ENCRYPTION_KEY:secret});
async function call(method:string,path:string,body?:unknown,user=userA){
  const request=new Request(`https://inotion.eu.cc${path}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const actualPath=path.split('?')[0], logicalPath=actualPath.replace(/^\/api\/notes\/[^/]+\/restore$/,'/api/notes/:id/restore').replace(/^\/api\/notes\/[^/]+$/,'/api/notes/:id').replace(/^\/api\/(folders|tags)\/[^/]+$/,'/api/$1/:id');
  const response=await handleNotes(request,env(),user,logicalPath,new URL(request.url));
  if(!response)throw new Error('No route matched');
  return {response,data:await response.json() as any};
}

beforeEach(async()=>{
  sqlite=new DatabaseSync(':memory:');
  db={
    prepare(sql:string){let params:unknown[]=[];const statement=sqlite.prepare(sql);const wrapper:any={bind(...args:unknown[]){params=args;return wrapper;},first(column?:string){const row=statement.get(...params);return column?(row?.[column]??null):(row??null);},all(){return {results:statement.all(...params)};},run(){const result=statement.run(...params);return {meta:{changes:Number(result.changes)}};}};return wrapper;},
    async exec(sql:string){sqlite.exec(sql);return {count:0,duration:0,results:[]};}
  } as unknown as D1Database;
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL);
    INSERT INTO users VALUES('user-a','a@example.test'),('user-b','b@example.test');
    CREATE TABLE folders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,position INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(user_id,parent_id,name));
    CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,title TEXT NOT NULL DEFAULT '',body_md TEXT NOT NULL DEFAULT '',is_pinned INTEGER NOT NULL DEFAULT 0,archived_at INTEGER,trashed_at INTEGER,reminder_at INTEGER,source_url TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,short_code TEXT UNIQUE);
    CREATE TABLE note_revisions(id TEXT PRIMARY KEY,note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),revision INTEGER NOT NULL,title TEXT NOT NULL,body_md TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX notes_user_views ON notes(user_id,trashed_at,archived_at,is_pinned,updated_at DESC);
    CREATE TABLE tags(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,name));
    CREATE TABLE note_tags(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(note_id,tag_id));
    CREATE TABLE sync_tombstones(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,deleted_at INTEGER NOT NULL);
    CREATE VIRTUAL TABLE notes_fts USING fts5(title,content='notes',content_rowid='rowid',tokenize='unicode61');
    CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN INSERT INTO notes_fts(rowid,title) VALUES(new.rowid,new.title); END;
    CREATE TRIGGER notes_fts_update AFTER UPDATE OF title ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title) VALUES('delete',old.rowid,old.title); INSERT INTO notes_fts(rowid,title) VALUES(new.rowid,new.title); END;
    CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title) VALUES('delete',old.rowid,old.title); END;`);
});
afterEach(()=>{sqlite?.close();});

describe('notes CRUD and ownership',()=>{
  it('generates unique eight character codes and resolves notes by short code',async()=>{
    const codes=Array.from({length:200},generateShortCode);
    expect(codes.every(code=>/^[A-Za-z0-9]{8}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    const created=await call('POST','/api/notes',{title:'Short link',body_md:'body'});
    expect(created.data.short_code).toMatch(/^[A-Za-z0-9]{8}$/);
    expect((await call('GET',`/api/notes/${created.data.short_code}`)).data.id).toBe(created.data.id);
  });
  it('creates encrypted notes, reads them back, updates revision, and rejects stale writes',async()=>{
    const created=await call('POST','/api/notes',{title:'First title',body_md:'private body phrase'});
    expect(created.response.status).toBe(201);const note=created.data;
    const stored=await db.prepare('SELECT body_md FROM notes WHERE id=?').bind(note.id).first<{body_md:string}>();
    expect(stored?.body_md.startsWith('enc:v1:')).toBe(true);expect(stored?.body_md).not.toContain('private');
    expect((await call('GET',`/api/notes/${note.id}`)).data.body_md).toBe('private body phrase');
    const updated=await call('PATCH',`/api/notes/${note.id}`,{revision:1,title:'Changed'});
    expect(updated.data.revision).toBe(2);expect(updated.data.title).toBe('Changed');
    expect((await call('PATCH',`/api/notes/${note.id}`,{revision:1,title:'Lost update'})).response.status).toBe(409);
  });
  it('isolates note read, update, and permanent delete by user',async()=>{
    const {data:note}=await call('POST','/api/notes',{title:'Private',body_md:'owned'});
    expect((await call('GET',`/api/notes/${note.id}`,undefined,userB)).response.status).toBe(404);
    expect((await call('PATCH',`/api/notes/${note.id}`,{revision:1,title:'stolen'},userB)).response.status).toBe(404);
    expect((await call('DELETE',`/api/notes/${note.id}`,undefined,userB)).response.status).toBe(404);
    expect((await db.prepare('SELECT id FROM notes WHERE id=?').bind(note.id).first<{id:string}>())?.id).toBe(note.id);
  });
  it('supports pin, archive, trash, restore, and title FTS insert/update/delete',async()=>{
    const {data:note}=await call('POST','/api/notes',{title:'Olive project',body_md:'body'});
    const list=async(q:string,view='all')=>(await call('GET',`/api/notes?view=${view}&q=${encodeURIComponent(q)}`)).data.notes;
    expect((await list('olive')).map((n:any)=>n.id)).toContain(note.id);
    const pinned=await call('PATCH',`/api/notes/${note.id}`,{revision:1,is_pinned:true,title:'Juniper project'});
    expect(pinned.data.is_pinned).toBe(true);expect(await list('olive')).toHaveLength(0);expect((await list('juniper','pinned'))).toHaveLength(1);
    const archived=await call('PATCH',`/api/notes/${note.id}`,{revision:2,archived_at:Date.now()});
    expect((await call('GET','/api/notes?view=archive')).data.notes).toHaveLength(1);
    await call('PATCH',`/api/notes/${note.id}`,{revision:archived.data.revision,trashed_at:Date.now()});
    expect((await call('GET','/api/notes?view=trash')).data.notes).toHaveLength(1);
    const restored=await call('POST',`/api/notes/${note.id}/restore`);
    expect(restored.response.status).toBe(200);expect(restored.data.trashed_at).toBeNull();expect(restored.data.archived_at).toBeNull();
    expect((await call('GET','/api/notes?view=all')).data.notes).toHaveLength(1);
    expect((await call('DELETE',`/api/notes/${note.id}`)).data.ok).toBe(true);
    expect(await list('juniper')).toHaveLength(0);
  });
  it('searches encrypted body text, deduplicates title plus body matches, and never returns another user',async()=>{
    const both=await call('POST','/api/notes',{title:'Cedar keyword',body_md:'The cedar keyword appears in body too'});
    const bodyOnly=await call('POST','/api/notes',{title:'Different title',body_md:'Only the rareword is in this encrypted body'});
    await call('POST','/api/notes',{title:'Cedar keyword',body_md:'other account',},userB);
    const results=(await call('GET','/api/notes?q=cedar')).data.notes;
    expect(results.filter((note:any)=>note.id===both.data.id)).toHaveLength(1);
    expect((await call('GET','/api/notes?q=rareword')).data.notes.map((note:any)=>note.id)).toContain(bodyOnly.data.id);
    expect(results.every((note:any)=>note.user_id===userA.id)).toBe(true);
  });
});

describe('folders and tags',()=>{
  it('enforces folder ownership and cycle checks and moves direct child notes to root on delete',async()=>{
    const root=await call('POST','/api/folders',{name:'Root'}), child=await call('POST','/api/folders',{name:'Child',parent_id:root.data.id});
    expect((await call('PATCH',`/api/folders/${root.data.id}`,{name:'Root',parent_id:child.data.id})).response.status).toBe(400);
    expect((await call('POST','/api/folders',{name:'Nope',parent_id:root.data.id},userB)).response.status).toBe(404);
    const {data:note}=await call('POST','/api/notes',{title:'Nested',body_md:'x',folder_id:root.data.id});
    await call('DELETE',`/api/folders/${root.data.id}`);
    const moved=await call('GET',`/api/notes/${note.id}`);expect(moved.data.folder_id).toBeNull();
  });
  it('creates, assigns, counts, renames, and removes tags',async()=>{
    const tag=await call('POST','/api/tags',{name:'Ideas'}), note=await call('POST','/api/notes',{title:'Tagged',body_md:'x'});
    const saved=await call('PATCH',`/api/notes/${note.data.id}`,{revision:1,tag_ids:[tag.data.id]});
    expect(saved.data.tags).toEqual([{id:tag.data.id,name:'Ideas'}]);
    expect((await call('GET','/api/tags')).data[0].note_count).toBe(1);
    expect(Array.isArray((await call('GET','/api/tags')).data)).toBe(true);
    expect(Array.isArray((await call('GET','/api/folders')).data)).toBe(true);
    await call('PATCH',`/api/tags/${tag.data.id}`,{name:'Thoughts'});
    expect((await call('GET',`/api/notes/${note.data.id}`)).data.tags[0].name).toBe('Thoughts');
    await call('DELETE',`/api/tags/${tag.data.id}`);expect((await call('GET',`/api/notes/${note.data.id}`)).data.tags).toEqual([]);
  });
});
