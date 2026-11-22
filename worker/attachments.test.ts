import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { deleteNoteAttachments, handleAttachments } from './attachments';
import type { SessionUser } from './auth';

const user:SessionUser={id:'user-a',email:'a@example.test'}, other:SessionUser={id:'user-b',email:'b@example.test'};
let sqlite:any,db:D1Database,objects:Map<string,Uint8Array>,originalFetch:typeof fetch;
const env=()=>({DB:db,B2_KEY_ID:'test-key-id',B2_APPLICATION_KEY:'test-app-key',B2_BUCKET_NAME:'private-bucket',B2_S3_ENDPOINT:'https://s3.us-east-005.backblazeb2.com'});
const call=async(request:Request,path:string,who=user)=>handleAttachments(request,env(),who,path,new URL(request.url));
beforeEach(async()=>{
  sqlite=new DatabaseSync(':memory:');objects=new Map();originalFetch=globalThis.fetch;
  globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input)),key=decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
    const method=init?.method||'GET';
    if(method==='PUT'){objects.set(key,new Uint8Array(await new Response(init?.body).arrayBuffer()));return new Response(null,{status:200});}
    if(method==='DELETE'){objects.delete(key);return new Response(null,{status:204});}
    const data=objects.get(key);return data?new Response(data.slice().buffer as ArrayBuffer,{status:200}):new Response(null,{status:404});
  }) as typeof fetch;
  db={prepare(sql:string){let params:unknown[]=[];const statement=sqlite.prepare(sql);const wrapper:any={bind(...args:unknown[]){params=args;return wrapper;},first(column?:string){const row=statement.get(...params);return column?(row?.[column]??null):(row??null);},all(){return{results:statement.all(...params)};},run(){const result=statement.run(...params);return{meta:{changes:Number(result.changes)}};}};return wrapper;},async exec(sql:string){sqlite.exec(sql);return{count:0,duration:0,results:[]};}} as unknown as D1Database;
  await db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('user-a'),('user-b');CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL DEFAULT '',body_md TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1);INSERT INTO notes(id,user_id,created_at,updated_at) VALUES('note-a','user-a',1,1),('note-b','user-b',1,1);CREATE TABLE attachments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),note_id TEXT NOT NULL REFERENCES notes(id),object_key TEXT NOT NULL UNIQUE,filename TEXT NOT NULL,content_type TEXT NOT NULL,byte_size INTEGER NOT NULL,created_at INTEGER NOT NULL);`);
});
afterEach(()=>{globalThis.fetch=originalFetch;sqlite?.close();});

describe('B2 attachment lifecycle',()=>{
  it('uploads, stores only metadata, streams safe content, isolates ownership, and deletes idempotently',async()=>{
    const form=new FormData();form.set('file',new File(['picture'],'photo.png',{type:'image/png'}));
    const upload=await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments',{method:'POST',body:form}),'/api/notes/note-a/attachments');
    expect(upload?.status).toBe(201);const created=await upload!.json() as any;expect(created.quotaWarning).toBe(false);expect(objects.size).toBe(1);
    const list=await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments'),'/api/notes/note-a/attachments');expect(await list!.json()).toHaveLength(1);
    const denied=await call(new Request(`https://inotion.eu.cc/api/attachments/${created.id}`),`/api/attachments/${created.id}`,other);expect(denied?.status).toBe(404);
    const fetched=await call(new Request(`https://inotion.eu.cc/api/attachments/${created.id}`),`/api/attachments/${created.id}`);expect(fetched?.status).toBe(200);expect(fetched?.headers.get('Content-Disposition')).toContain('inline');expect(fetched?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const removed=await call(new Request(`https://inotion.eu.cc/api/attachments/${created.id}`,{method:'DELETE'}),`/api/attachments/${created.id}`);expect(removed?.status).toBe(200);expect(objects.size).toBe(0);
    const again=await call(new Request(`https://inotion.eu.cc/api/attachments/${created.id}`,{method:'DELETE'}),`/api/attachments/${created.id}`);expect(again?.status).toBe(404);
  });
  it('rejects unsafe MIME types and attachments beyond the per-note quota',async()=>{
    const bad=new FormData();bad.set('file',new File(['<svg/>'],'active.svg',{type:'image/svg+xml'}));
    expect((await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments',{method:'POST',body:bad}),'/api/notes/note-a/attachments'))?.status).toBe(415);
    await db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').bind('existing','user-a','note-a','user-a/note-a/existing','large.pdf','application/pdf',25*1024*1024,1).run();
    const form=new FormData();form.set('file',new File(['x'],'small.txt',{type:'text/plain'}));
    const response=await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments',{method:'POST',body:form}),'/api/notes/note-a/attachments');expect(response?.status).toBe(413);
  });
  it('rolls back an uploaded object when metadata insert fails and raises the global quota warning',async()=>{
    const form=new FormData();form.set('file',new File(['valid'],'note.txt',{type:'text/plain'}));
    await db.exec("CREATE TRIGGER reject_attachment BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT,'simulated insert failure'); END;");
    const failed=await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments',{method:'POST',body:form}),'/api/notes/note-a/attachments');expect(failed?.status).toBe(500);expect(objects.size).toBe(0);
    await db.exec('DROP TRIGGER reject_attachment;');
    await db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').bind('quota','user-b','note-b','user-b/note-b/quota','large.pdf','application/pdf',7*1024*1024*1024,1).run();
    const uploaded=await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments',{method:'POST',body:form}),'/api/notes/note-a/attachments');expect((await uploaded!.json() as any).quotaWarning).toBe(true);
  });
  it('removes B2 objects and metadata for a permanent note deletion',async()=>{
    const form=new FormData();form.set('file',new File(['valid'],'note.txt',{type:'text/plain'}));
    await call(new Request('https://inotion.eu.cc/api/notes/note-a/attachments',{method:'POST',body:form}),'/api/notes/note-a/attachments');expect(objects.size).toBe(1);
    await deleteNoteAttachments(env(),user,'note-a');expect(objects.size).toBe(0);
    expect((await db.prepare('SELECT id FROM attachments WHERE note_id=?').bind('note-a').all()).results).toHaveLength(0);
  });
});
