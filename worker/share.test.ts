import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { encryptText } from './crypto';
import { handlePublic, handleShareApi, sanitizePublicMarkdown } from './share';
import type { SessionUser } from './auth';

const user:SessionUser={id:'u',email:'u@example.test'}, secret=btoa('01234567890123456789012345678901');
let sqlite:any,db:D1Database;
const env=()=>({DB:db,ENCRYPTION_KEY:secret});
async function call(method:string,path:string,value?:unknown){const req=new Request(`https://notes.test${path}`,{method,...(value===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})});const res=await handleShareApi(req,env(),user,path);if(!res)throw new Error('Route not matched');return {res,data:await res.json() as any}}

beforeEach(async()=>{
 sqlite=new DatabaseSync(':memory:');db={prepare(sql:string){let args:unknown[]=[];const stmt=sqlite.prepare(sql),wrap:any={bind(...a:unknown[]){args=a;return wrap},first(){return stmt.get(...args)||null},all(){return {results:stmt.all(...args)}},run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}};return wrap},async exec(sql:string){sqlite.exec(sql);return {count:0,duration:0,results:[]}}} as unknown as D1Database;
 await db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('u');CREATE TABLE folders(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,parent_id TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT,folder_id TEXT,title TEXT,body_md TEXT,trashed_at INTEGER,archived_at INTEGER,created_at INTEGER,updated_at INTEGER);CREATE TABLE note_shares(id TEXT PRIMARY KEY,note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,user_id TEXT,ciphertext_b64 TEXT,iv_b64 TEXT,expires_at INTEGER,revoked_at INTEGER,created_at INTEGER);CREATE TABLE folder_publications(folder_id TEXT PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,user_id TEXT,slug TEXT UNIQUE,include_subfolders INTEGER,created_at INTEGER,updated_at INTEGER);CREATE TABLE public_route_traffic(day INTEGER PRIMARY KEY,requests INTEGER);INSERT INTO folders VALUES('f','u','Folder',NULL,1,1);INSERT INTO notes VALUES('n','u','f','Title','',NULL,NULL,1,1);`);
});

describe('share links and notebook publications',()=>{
 it('creates, lists, revokes shares and returns 404 for revoked or expired snapshots',async()=>{
  const created=await call('POST','/api/notes/n/shares',{ciphertext_b64:'cipher',iv_b64:'iv',expires_at:Date.now()+100000});expect(created.res.status).toBe(201);
  expect((await call('GET','/api/notes/n/shares')).data).toHaveLength(1);
  const publicReq=new Request(`https://notes.test/api/public/share/${created.data.id}`);const live=await handlePublic(publicReq,env(),`/api/public/share/${created.data.id}`);expect(live?.status).toBe(200);expect(live?.headers.get('Content-Security-Policy')).toContain("object-src 'none'");
  await call('DELETE',`/api/shares/${created.data.id}`);const revoked=await handlePublic(publicReq,env(),`/api/public/share/${created.data.id}`);expect(revoked?.status).toBe(404);
  await db.prepare('INSERT INTO note_shares VALUES(?,?,?,?,?,?,?,?)').bind('expired','n','u','x','y',Date.now()-1, null,Date.now()).run();expect((await handlePublic(new Request('https://notes.test'),env(),'/api/public/share/expired'))?.status).toBe(404);
 });
 it('publishes/unpublishes folders and filters trashed/archived notes',async()=>{
  const pub=await call('PUT','/api/folders/f/publish',{slug:'my-notebook'});expect(pub.data.slug).toBe('my-notebook');
  const response=await handlePublic(new Request('https://notes.test'),env(),'/api/public/site/my-notebook');expect(response?.status).toBe(200);expect(response?.headers.get('Cache-Control')).toBe('public, max-age=86400');expect((await response!.json() as any).notes).toHaveLength(1);
  await call('DELETE','/api/folders/f/publish');expect((await handlePublic(new Request('https://notes.test'),env(),'/api/public/site/my-notebook'))?.status).toBe(404);
 });
 it('sanitizes HTML and unsafe link schemes while preserving safe links',async()=>{
  expect(sanitizePublicMarkdown('<script>alert(1)</script> **safe** [bad](javascript:alert) [ok](https://example.test) [mail](mailto:a@example.test)')).toBe('alert(1) **safe** bad [ok](https://example.test) [mail](mailto:a@example.test)');
 });
 it('stores public notebook body only as encrypted note content and applies strict public headers',async()=>{
  const encrypted=await encryptText('<script>alert(1)</script> [x](javascript:alert(1))',await crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['decrypt','encrypt']));
  await db.prepare('UPDATE notes SET body_md=? WHERE id=?').bind(encrypted,'n').run();await call('PUT','/api/folders/f/publish',{slug:'safe'});
  const response=await handlePublic(new Request('https://notes.test'),env(),'/api/public/site/safe');expect(response?.headers.get('Content-Security-Policy')).toBe("default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'");expect(response?.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');const body=(await response!.json() as any).notes[0].body_md;expect(body).not.toContain('<script>');expect(body).not.toContain('javascript:');
 });
});
