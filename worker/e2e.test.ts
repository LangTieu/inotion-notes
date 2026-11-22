import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import worker from './index';
import { hashPassword } from './auth';

let sqlite:DatabaseSync, db:D1Database, originalFetch:typeof fetch;
const password='e2e-only-password-not-a-secret';
const env=()=>({DB:db,ASSETS:{fetch:async()=>new Response('asset')},ALLOWED_EMAILS:'owner@example.test',ENCRYPTION_KEY:btoa('01234567890123456789012345678901'),B2_KEY_ID:'test-id',B2_APPLICATION_KEY:'test-key',B2_BUCKET_NAME:'notes',B2_S3_ENDPOINT:'https://s3.us-east-005.backblazeb2.com'} as never);
async function request(path:string,method='GET',body?:BodyInit, cookie?:string, multipart=false) {
  const headers=new Headers(); if(['POST','PATCH','DELETE'].includes(method))headers.set('Origin','https://inotion.eu.cc');
  if(cookie)headers.set('Cookie',cookie); if(body&&!multipart)headers.set('Content-Type','application/json');
  return worker.fetch(new Request(`https://inotion.eu.cc${path}`,{method,headers,...(body===undefined?{}:{body})}),env());
}
async function json(response:Response){return response.json() as Promise<any>;}

beforeEach(async()=>{
  sqlite=new DatabaseSync(':memory:');originalFetch=globalThis.fetch;
  const objects=new Map<string,Uint8Array>();
  globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input)), key=decodeURIComponent(url.pathname.split('/').slice(2).join('/')), method=init?.method||'GET';
    if(method==='PUT'){objects.set(key,new Uint8Array(await new Response(init?.body).arrayBuffer()));return new Response(null,{status:200});}
    if(method==='DELETE'){objects.delete(key);return new Response(null,{status:204});}
    const value=objects.get(key);return value?new Response(value.slice().buffer as ArrayBuffer):new Response(null,{status:404});
  }) as typeof fetch;
  db={prepare(sql:string){let args:unknown[]=[];const statement=sqlite.prepare(sql);const result=(value:any)=>({meta:{changes:Number(value.changes||0)}});const bound:any={bind(...values:unknown[]){args=values;return bound;},first(){return statement.get(...args)||null;},all(){return{results:statement.all(...args)};},run(){return result(statement.run(...args));}};return bound;},async exec(sql:string){sqlite.exec(sql);return{count:0,duration:0,results:[]};}} as unknown as D1Database;
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,disabled_at INTEGER);
    CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,revoked_at INTEGER);
    CREATE TABLE login_attempts(key_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_started_at INTEGER NOT NULL);
    CREATE TABLE folders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,parent_id TEXT,position INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(user_id,parent_id,name));
    CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),folder_id TEXT,title TEXT NOT NULL DEFAULT '',body_md TEXT NOT NULL DEFAULT '',is_pinned INTEGER NOT NULL DEFAULT 0,archived_at INTEGER,trashed_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
    CREATE VIRTUAL TABLE notes_fts USING fts5(title,content='notes',content_rowid='rowid',tokenize='unicode61');
    CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN INSERT INTO notes_fts(rowid,title) VALUES(new.rowid,new.title); END;
    CREATE TRIGGER notes_fts_update AFTER UPDATE OF title ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title) VALUES('delete',old.rowid,old.title);INSERT INTO notes_fts(rowid,title) VALUES(new.rowid,new.title);END;
    CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title) VALUES('delete',old.rowid,old.title);END;
    CREATE TABLE tags(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,name));
    CREATE TABLE note_tags(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(note_id,tag_id));
    CREATE TABLE attachments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,object_key TEXT NOT NULL UNIQUE,filename TEXT NOT NULL,content_type TEXT NOT NULL,byte_size INTEGER NOT NULL,created_at INTEGER NOT NULL);`);
  await db.prepare('INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').bind('owner','owner@example.test',await hashPassword(password),Date.now(),Date.now()).run();
});
afterEach(()=>{globalThis.fetch=originalFetch;sqlite?.close();});

describe('Phase 4 authenticated end-to-end flow',()=>{
  it('persists encrypted notes across sessions and covers organization, conflict, search, attachments, trash, restore, and deletion',async()=>{
    const login=await request('/api/auth/login','POST',JSON.stringify({email:'owner@example.test',password}));expect(login.status).toBe(200);
    let cookie=login.headers.get('Set-Cookie')!.split(';')[0];
    const folder=await json(await request('/api/folders','POST',JSON.stringify({name:'Project'}),cookie));
    const tag=await json(await request('/api/tags','POST',JSON.stringify({name:'Research'}),cookie));
    const note=await json(await request('/api/notes','POST',JSON.stringify({title:'Cedar plan',body_md:'Encrypted body has amber phrase',folder_id:folder.id}),cookie));
    await request(`/api/notes/${note.id}`,'PATCH',JSON.stringify({revision:1,title:'Cedar plan revised',body_md:'Encrypted body has amber phrase updated',tag_ids:[tag.id]}),cookie);
    const secondLogin=await request('/api/auth/login','POST',JSON.stringify({email:'owner@example.test',password})),secondCookie=secondLogin.headers.get('Set-Cookie')!.split(';')[0];
    await request(`/api/notes/${note.id}`,'PATCH',JSON.stringify({revision:2,title:'Cedar plan second-device',body_md:'Encrypted body has amber phrase updated again',tag_ids:[tag.id]}),secondCookie);
    expect((await request(`/api/notes/${note.id}`,'PATCH',JSON.stringify({revision:2,title:'stale'}),cookie)).status).toBe(409);
    const stored=await db.prepare('SELECT body_md FROM notes WHERE id=?').bind(note.id).first<{body_md:string}>();expect(stored?.body_md).toMatch(/^enc:v1:/);expect(stored?.body_md).not.toContain('amber');
    expect((await json(await request('/api/notes?q=amber','GET',undefined,cookie))).notes.map((n:any)=>n.id)).toContain(note.id);
    expect((await json(await request('/api/notes?q=second-device','GET',undefined,cookie))).notes.map((n:any)=>n.id)).toContain(note.id);
    const form=new FormData();form.set('file',new File(['attachment bytes'],'note.txt',{type:'text/plain'}));
    const uploaded=await json(await request(`/api/notes/${note.id}/attachments`,'POST',form,cookie,true));
    expect((await request(`/api/attachments/${uploaded.id}`,'GET',undefined,cookie)).status).toBe(200);
    expect((await request(`/api/attachments/${uploaded.id}`,'DELETE',undefined,cookie)).status).toBe(200);
    const current=await json(await request(`/api/notes/${note.id}`,'GET',undefined,cookie));
    await request(`/api/notes/${note.id}`,'PATCH',JSON.stringify({revision:current.revision,trashed_at:Date.now()}),cookie);
    expect((await json(await request('/api/notes?view=trash','GET',undefined,cookie))).notes).toHaveLength(1);
    expect((await request(`/api/notes/${note.id}/restore`,'POST','{}',cookie)).status).toBe(200);
    const restored=await json(await request(`/api/notes/${note.id}`,'GET',undefined,cookie));
    await request(`/api/notes/${note.id}`,'PATCH',JSON.stringify({revision:restored.revision,trashed_at:Date.now()}),cookie);
    expect((await request(`/api/notes/${note.id}`,'DELETE',undefined,cookie)).status).toBe(200);
    expect((await request('/api/auth/logout','POST','{}',cookie)).status).toBe(200);
    expect((await request('/api/auth/me','GET',undefined,cookie)).status).toBe(401);
    const nextLogin=await request('/api/auth/login','POST',JSON.stringify({email:'owner@example.test',password}));cookie=nextLogin.headers.get('Set-Cookie')!.split(';')[0];
    expect((await json(await request('/api/notes','GET',undefined,cookie))).notes).toHaveLength(0);
  });
});
