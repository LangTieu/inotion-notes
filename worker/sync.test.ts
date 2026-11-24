import { beforeEach, describe, expect, it, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { encryptText } from './crypto';
import { handleSync } from './sync';
import type { SessionUser } from './auth';

const secret=btoa('01234567890123456789012345678901'), a:SessionUser={id:'a',email:'a@test'}, b:SessionUser={id:'b',email:'b@test'};
let sqlite:any, db:D1Database;
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');for(const [id,email] of [['a','a@test'],['b','b@test']]){sqlite.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT); INSERT OR IGNORE INTO users VALUES('${id}','${email}')`);}sqlite.exec(`CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT,folder_id TEXT,title TEXT,body_md TEXT,is_pinned INTEGER,archived_at INTEGER,trashed_at INTEGER,created_at INTEGER,updated_at INTEGER,revision INTEGER);CREATE TABLE folders(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,parent_id TEXT,position INTEGER,created_at INTEGER,updated_at INTEGER);CREATE TABLE tags(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE note_tags(note_id TEXT,tag_id TEXT);CREATE TABLE sync_tombstones(id TEXT,user_id TEXT,entity_type TEXT,entity_id TEXT,deleted_at INTEGER);`);db={prepare(sql:string){let args:any[]=[];const stmt=sqlite.prepare(sql),w:any={bind(...x:any[]){args=x;return w},first(){return stmt.get(...args)||null},all(){return {results:stmt.all(...args)}},run(){const x=stmt.run(...args);return {meta:{changes:Number(x.changes)}}}};return w;}} as any;});
async function delta(user=a,since=0,database?:D1Database){const response=await handleSync(new Request(`https://app.test/api/sync?since=${since}`),{DB:database??db,ENCRYPTION_KEY:secret},user);return response!.json() as Promise<any>}
describe('GET /api/sync',()=>{
  it('returns only records changed after since',async()=>{const body=await encryptText('new',await (await import('./crypto')).getEncryptionKey(secret));sqlite.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('old','a',null,'old',body,0,null,null,1,10,1);sqlite.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('new','a',null,'new',body,0,null,null,1,20,1);sqlite.prepare('INSERT INTO folders VALUES(?,?,?,?,?,?,?)').run('f','a','F',null,0,1,20);sqlite.prepare('INSERT INTO tags VALUES(?,?,?,?,?)').run('t','a','T',20,20);const result=await delta(a,15);expect(result.notes.map((x:any)=>x.id)).toEqual(['new']);expect(result.folders).toHaveLength(1);expect(result.tags).toHaveLength(1)});
  it('returns tombstones and isolates notes, folders, tags, and tombstones by user',async()=>{const encrypted=await encryptText('private',await (await import('./crypto')).getEncryptionKey(secret));for(const id of ['a-note','b-note'])sqlite.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,id[0],null,id,encrypted,0,null,null,1,20,1);for(const id of ['a-folder','b-folder'])sqlite.prepare('INSERT INTO folders VALUES(?,?,?,?,?,?,?)').run(id,id[0],id,null,0,1,20);for(const id of ['a-tag','b-tag'])sqlite.prepare('INSERT INTO tags VALUES(?,?,?,?,?)').run(id,id[0],id,20,20);sqlite.prepare('INSERT INTO sync_tombstones VALUES(?,?,?,?,?)').run('d','a','note','gone',20);sqlite.prepare('INSERT INTO sync_tombstones VALUES(?,?,?,?,?)').run('e','b','note','secret',20);expect((await delta(a,10)).deleted_note_ids).toEqual(['gone']);const other=await delta(b,10);expect(other.notes.map((x:any)=>x.id)).toEqual(['b-note']);expect(other.folders.map((x:any)=>x.id)).toEqual(['b-folder']);expect(other.tags.map((x:any)=>x.id)).toEqual(['b-tag']);expect(other.deleted_note_ids).toEqual(['secret']);});
  it('caps the combined change page at 200 and signals more',async()=>{const insert=sqlite.prepare('INSERT INTO folders VALUES(?,?,?,?,?,?,?)');for(let i=0;i<205;i++)insert.run(`f${i}`,'a',`Folder ${i}`,null,0,1,10+i);const result=await delta(a,0);expect(result.folders).toHaveLength(200);expect(result.has_more).toBe(true)});
});

describe('GET /api/sync against a real D1 (miniflare)',()=>{
  let proxy:Awaited<ReturnType<typeof getPlatformProxy<{DB:D1Database}>>>;
  const user:SessionUser={id:'d1-user',email:'d1@test'};

  beforeAll(async()=>{
    proxy=await getPlatformProxy({ persist: false });
    const migrations=['0001_users_sessions.sql','0002_seed_test_user.sql','0003_notes_folders_tags_fts.sql','0008_sync_tombstones.sql','0013_tags_updated_at.sql'];
    for(const name of migrations){
      const statements:string[]=[];let buffer='';
      for(const line of (await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')).split('\n')){
        const trimmed=line.trim();
        if(!trimmed||trimmed.startsWith('--')||trimmed.toUpperCase().startsWith('PRAGMA'))continue;
        buffer=`${buffer}${line} `;
        const begins=(buffer.match(/\bBEGIN\b/gi)??[]).length,ends=(buffer.match(/\bEND\b/gi)??[]).length;
        if(trimmed.endsWith(';')&&begins===ends){statements.push(buffer.trim());buffer='';}
      }
      for(const statement of statements)await proxy.env.DB.exec(statement);
    }
    await proxy.env.DB.prepare('INSERT OR IGNORE INTO users(id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').bind(user.id,user.email,'x',0,0).run();
  });
  afterAll(async()=>{await proxy.dispose()});

  it('picks up tag renames via updated_at and reports folder/tag tombstones',async()=>{
    const db=proxy.env.DB,now=Date.now();
    await db.prepare('INSERT INTO tags(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind('t1',user.id,'Before',now-1000,now-1000).run();
    await db.prepare('INSERT INTO folders(id,user_id,name,parent_id,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('f1',user.id,'F',null,0,now-1000,now-1000).run();
    // Rename propagates even though created_at is unchanged:
    await db.prepare('UPDATE tags SET name=?,updated_at=? WHERE id=?').bind('After',now,'t1').run();
    const afterRename=await delta(user,now-500,db);
    expect(afterRename.tags.map((t:any)=>({id:t.id,name:t.name}))).toEqual([{id:'t1',name:'After'}]);
    expect(afterRename.tags[0].updated_at).toBe(now);
    // Deleting the tag and folder surfaces tombstones:
    await db.prepare('DELETE FROM tags WHERE id=?').bind('t1').run();
    await db.prepare('INSERT INTO sync_tombstones(id,user_id,entity_type,entity_id,deleted_at) VALUES(?,?,?,?,?)').bind('tb1',user.id,'tag','t1',now+10).run();
    await db.prepare('DELETE FROM folders WHERE id=?').bind('f1').run();
    await db.prepare('INSERT INTO sync_tombstones(id,user_id,entity_type,entity_id,deleted_at) VALUES(?,?,?,?,?)').bind('tb2',user.id,'folder','f1',now+10).run();
    const afterDelete=await delta(user,now-500,db);
    expect(afterDelete.tags).toHaveLength(0);
    expect(afterDelete.deleted_tag_ids).toEqual(['t1']);
    expect(afterDelete.deleted_folder_ids).toEqual(['f1']);
  });
});
