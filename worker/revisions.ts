import { decryptText, encryptText, getEncryptionKey, ENC_PREFIX } from './crypto';
import type { SessionUser } from './auth';
import type { NotesEnv } from './notes';

type NoteRow={id:string;user_id:string;title:string;body_md:string;revision:number;updated_at:number};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const error=(message:string,status=400)=>json({error:message},status);
const id=()=>crypto.randomUUID();

export async function maybeSnapshotNote(env:NotesEnv,db:D1Database,noteRow:NoteRow,options:{force?:boolean}={}) {
  const latest=await db.prepare('SELECT created_at FROM note_revisions WHERE note_id=? ORDER BY created_at DESC LIMIT 1').bind(noteRow.id).first<{created_at:number}>();
  const now=Date.now();
  if(!options.force&&latest&&now-latest.created_at<120_000)return false;
  const revision=noteRow.revision,key=await getEncryptionKey(env.ENCRYPTION_KEY);
  const body=noteRow.body_md.startsWith(ENC_PREFIX)?noteRow.body_md:await encryptText(noteRow.body_md,key);
  await db.prepare('INSERT INTO note_revisions(id,note_id,user_id,revision,title,body_md,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(),noteRow.id,noteRow.user_id,revision,noteRow.title,body,now).run();
  await db.prepare('DELETE FROM note_revisions WHERE note_id=? AND id NOT IN (SELECT id FROM note_revisions WHERE note_id=? ORDER BY created_at DESC,id DESC LIMIT 30)').bind(noteRow.id,noteRow.id).run();
  return true;
}

export async function handleRevisions(request:Request,env:NotesEnv,user:SessionUser,path:string,url:URL):Promise<Response|null> {
  const match=url.pathname.match(/^\/api\/notes\/([^/]+)\/revisions(?:\/([^/]+)(?:\/(restore))?)?$/);
  if(!match)return null;
  const noteId=decodeURIComponent(match[1]),revId=match[2]&&decodeURIComponent(match[2]);
  const note=await env.DB.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first<NoteRow>();
  if(!note)return error('Note not found',404);
  if(!revId&&request.method==='GET') {
    const rows=await env.DB.prepare('SELECT id,revision,title,created_at,LENGTH(body_md) AS byte_length FROM note_revisions WHERE note_id=? AND user_id=? ORDER BY created_at DESC LIMIT 30').bind(noteId,user.id).all();
    return json(rows.results||[]);
  }
  if(revId&&request.method==='GET') {
    const row=await env.DB.prepare('SELECT id,revision,title,body_md,created_at FROM note_revisions WHERE id=? AND note_id=? AND user_id=?').bind(revId,noteId,user.id).first<{id:string;revision:number;title:string;body_md:string;created_at:number}>();
    if(!row)return error('Revision not found',404);
    return json({...row,body_md:await decryptText(row.body_md,await getEncryptionKey(env.ENCRYPTION_KEY))});
  }
  if(revId&&match[3]==='restore'&&request.method==='POST') {
    let input:any;try{input=await request.json()}catch{return error('Invalid JSON body');}
    if(note.revision!==Number(input?.current_revision))return error('Revision conflict',409);
    const selected=await env.DB.prepare('SELECT title,body_md FROM note_revisions WHERE id=? AND note_id=? AND user_id=?').bind(revId,noteId,user.id).first<{title:string;body_md:string}>();
    if(!selected)return error('Revision not found',404);
    await maybeSnapshotNote(env,env.DB,note,{force:true});
    const key=await getEncryptionKey(env.ENCRYPTION_KEY),now=Date.now();
    const saved=await env.DB.prepare('UPDATE notes SET title=?,body_md=?,updated_at=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=?').bind(selected.title,selected.body_md.startsWith(ENC_PREFIX)?selected.body_md:await encryptText(selected.body_md,key),now,noteId,user.id,note.revision).run();
    if(!saved.meta.changes)return error('Revision conflict',409);
    const updated=await env.DB.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').bind(noteId,user.id).first<NoteRow>();
    return json({...updated,body_md:await decryptText(updated!.body_md,key)});
  }
  return null;
}
