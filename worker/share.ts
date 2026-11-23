import type { SessionUser } from './auth';
import { decryptText, getEncryptionKey } from './crypto';

interface ShareEnv { DB: D1Database; ENCRYPTION_KEY?: string }
const json=(value:unknown,status=200,publicRead=false)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...(publicRead?{'Cache-Control':'public, max-age=86400','Content-Security-Policy':"default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",'X-Robots-Tag':'noindex, nofollow'}:{'Cache-Control':'no-store'})}});
const error=(message:string,status=400,publicRead=false)=>json({error:message},status,publicRead);
const body=async(req:Request)=>{try{const v=await req.json();return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null}catch{return null}};
const randomId=()=>crypto.randomUUID();
async function purgePublicCache(){try{const cache=(caches as unknown as {default:Cache}).default;for(const key of await cache.keys())if(new URL(key.url).pathname.startsWith('/api/public/'))await cache.delete(key)}catch{/* Cache API is unavailable in local test runtimes. */}}
export async function publicTrafficLimited(env:ShareEnv):Promise<boolean>{
 const day=Math.floor(Date.now()/86400000);
 try{await env.DB.prepare('INSERT INTO public_route_traffic(day,requests) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1').bind(day).run();const count=await env.DB.prepare('SELECT requests FROM public_route_traffic WHERE day=?').bind(day).first<{requests:number}>();return (count?.requests||0)>80000}catch{return false}
}

/** Keep public Markdown inert even if a future renderer enables raw HTML or custom link handling. */
export function sanitizePublicMarkdown(markdown:string):string {
 const withoutHtml=markdown.replace(/<!--[^]*?-->/g,'').replace(/<\/?[A-Za-z][^>]*>/g,'');
 return withoutHtml.replace(/(!?\[([^\]]*)\])\((\s*<?)([^\s)>]+)([^)]*)\)/g,(whole,label,_text,spacing:string,destination:string,suffix:string)=>{
  const compact=destination.replace(/^<|>$/g,'');
  if(/^[a-z][a-z0-9+.-]*:/i.test(compact)&&!/^(https?|mailto):/i.test(compact))return label.replace(/^!?\[|\]$/g,'');
  return `${label}(${spacing}${destination}${suffix})`;
 });
}

export async function handleShareApi(request:Request,env:ShareEnv,user:SessionUser,path:string):Promise<Response|null>{
 const db=env.DB, now=Date.now();
 let m=path.match(/^\/api\/notes\/([^/]+)\/shares$/);
 if(m&&request.method==='POST'){
  const note=await db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').bind(m[1],user.id).first();if(!note)return error('Note not found',404);
  const input=await body(request);if(!input||typeof input.ciphertext_b64!=='string'||typeof input.iv_b64!=='string'||input.ciphertext_b64.length>300000||input.iv_b64.length>100)return error('Invalid encrypted snapshot');
  const expiration=input.expires_at===undefined||input.expires_at===null?null:Number(input.expires_at);if(expiration!==null&&(!Number.isSafeInteger(expiration)||expiration<=now))return error('Invalid expiration');
  await db.prepare('DELETE FROM note_shares WHERE expires_at IS NOT NULL AND expires_at<=?').bind(now).run();const id=randomId();await db.prepare('INSERT INTO note_shares(id,note_id,user_id,ciphertext_b64,iv_b64,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,m[1],user.id,input.ciphertext_b64,input.iv_b64,expiration,now).run();
  return json({id,expires_at:expiration,created_at:now},201);
 }
 if(m&&request.method==='GET'){
  await db.prepare('DELETE FROM note_shares WHERE expires_at IS NOT NULL AND expires_at<=?').bind(now).run();const result=await db.prepare('SELECT id,expires_at,revoked_at,created_at FROM note_shares WHERE note_id=? AND user_id=? ORDER BY created_at DESC').bind(m[1],user.id).all();return json(result.results||[]);
 }
 m=path.match(/^\/api\/shares\/([^/]+)$/);if(m&&request.method==='DELETE'){const res=await db.prepare('UPDATE note_shares SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(now,m[1],user.id).run();if(res.meta.changes)await purgePublicCache();return res.meta.changes?json({ok:true}):error('Share not found',404)}
 m=path.match(/^\/api\/folders\/([^/]+)\/publish$/);if(m&&request.method==='PUT'){
  const exists=await db.prepare('SELECT id FROM folders WHERE id=? AND user_id=?').bind(m[1],user.id).first();if(!exists)return error('Folder not found',404);const input=await body(request),slug=typeof input?.slug==='string'?input.slug.trim().toLowerCase():'';
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug))return error('Slug must use letters, numbers, and hyphens');const prior=await db.prepare('SELECT created_at FROM folder_publications WHERE folder_id=?').bind(m[1]).first<{created_at:number}>(),created=prior?.created_at??now;
  try{await db.prepare('INSERT INTO folder_publications(folder_id,user_id,slug,include_subfolders,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(folder_id) DO UPDATE SET slug=excluded.slug,include_subfolders=excluded.include_subfolders,updated_at=excluded.updated_at').bind(m[1],user.id,slug,input?.include_subfolders?1:0,created,now).run()}catch{return error('Slug is already in use',409)}await purgePublicCache();return json({slug,include_subfolders:!!input?.include_subfolders,created_at:created,updated_at:now});
 }
 if(m&&request.method==='DELETE'){const r=await db.prepare('DELETE FROM folder_publications WHERE folder_id=? AND user_id=?').bind(m[1],user.id).run();if(r.meta.changes)await purgePublicCache();return r.meta.changes?json({ok:true}):error('Publication not found',404)}
 return null;
}

export async function handlePublic(request:Request,env:ShareEnv,path:string):Promise<Response|null>{
 const now=Date.now(), publicRead=true;
 if(await publicTrafficLimited(env))return json({error:'Public traffic limit reached'},503,true);
 let m=path.match(/^\/api\/public\/share\/([^/]+)$/);
 if(m&&request.method==='GET'){
  const row=await env.DB.prepare('SELECT s.ciphertext_b64,s.iv_b64,s.expires_at,s.revoked_at FROM note_shares s JOIN notes n ON n.id=s.note_id WHERE s.id=? AND n.trashed_at IS NULL').bind(m[1]).first<any>();if(row?.expires_at!==null&&row?.expires_at<=now)await env.DB.prepare('DELETE FROM note_shares WHERE id=? AND expires_at<=?').bind(m[1],now).run();if(!row||row.revoked_at!==null||(row.expires_at!==null&&row.expires_at<=now))return error('Not found',404,true);return json({ciphertext_b64:row.ciphertext_b64,iv_b64:row.iv_b64},200,true);
 }
 m=path.match(/^\/api\/public\/site\/([^/]+)$/);
 if(m&&request.method==='GET'){
  const pub=await env.DB.prepare('SELECT folder_id,user_id,include_subfolders FROM folder_publications WHERE slug=?').bind(m[1]).first<any>();if(!pub)return error('Not found',404,true);
  const rows=await env.DB.prepare(`SELECT n.id,n.title,n.body_md,n.updated_at FROM notes n JOIN folders f ON f.id=n.folder_id WHERE n.user_id=? AND n.trashed_at IS NULL AND n.archived_at IS NULL AND (f.id=? OR (?=1 AND f.id IN (WITH RECURSIVE sub(id) AS (SELECT id FROM folders WHERE parent_id=? AND user_id=? UNION ALL SELECT f2.id FROM folders f2 JOIN sub s ON f2.parent_id=s.id WHERE f2.user_id=?) SELECT id FROM sub))) ORDER BY f.name,n.updated_at DESC`).bind(pub.user_id,pub.folder_id,pub.include_subfolders,pub.folder_id,pub.user_id,pub.user_id).all<any>();
  const key=await getEncryptionKey(env.ENCRYPTION_KEY);const notes=await Promise.all((rows.results||[]).map(async (r:any)=>({id:r.id,title:r.title,body_md:sanitizePublicMarkdown(await decryptText(r.body_md,key)),updated_at:r.updated_at})));return json({slug:m[1],notes},200,true);
 }
 return null;
}
