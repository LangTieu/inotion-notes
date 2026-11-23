import { sha256Hex, currentSession, type AuthEnv, type SessionUser } from './auth';

export interface TokenEnv extends AuthEnv { DB: D1Database }
export type ApiToken = { id:string; user_id:string; name:string; prefix:string; token_hash:string; scopes:string; expires_at:number|null; last_used_at:number|null; revoked_at:number|null; created_at:number };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const fail=(message:string,status:number)=>json({error:message},status);
const metadata=(row:ApiToken)=>({id:row.id,name:row.name,prefix:row.prefix,scopes:JSON.parse(row.scopes),expires_at:row.expires_at,last_used_at:row.last_used_at,created_at:row.created_at});

export async function verifyApiToken(request:Request,env:TokenEnv):Promise<{token:ApiToken;user:SessionUser}|null>{
 const auth=request.headers.get('Authorization')||''; if(!/^Bearer ino_[A-Za-z0-9_-]{43}$/.test(auth))return null;
 const raw=auth.slice(7),hash=await sha256Hex(raw),now=Date.now();
 const row=await env.DB.prepare('SELECT t.*,u.email FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>?) AND u.disabled_at IS NULL').bind(hash,now).first<ApiToken&{email:string}>();
 if(!row)return null;
 await env.DB.prepare('UPDATE api_tokens SET last_used_at=? WHERE id=?').bind(now,row.id).run();
 return {token:row,user:{id:row.user_id,email:row.email}};
}
export async function handleTokens(request:Request,env:TokenEnv,path:string):Promise<Response>{
 const user=await currentSession(request,env);if(!user)return fail('Not authenticated',401);
 if(path==='/api/tokens'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,user_id,name,prefix,token_hash,scopes,expires_at,last_used_at,revoked_at,created_at FROM api_tokens WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC').bind(user.id).all<ApiToken>();
  return json((rows.results||[]).map(metadata));
 }
 if(path==='/api/tokens'&&request.method==='POST'){
  let input:any;try{input=await request.json()}catch{return fail('Invalid JSON body',400)}
  if(typeof input?.name!=='string'||!input.name.trim()||input.name.trim().length>100||!Array.isArray(input.scopes)||!input.scopes.length||(input.scopes as unknown[]).some((s)=>typeof s!=='string'||!['read','write','delete'].includes(s)))return fail('Invalid token name or scopes',400);
  const scopes=[...new Set(input.scopes as string[])];
  if(input.expires_at!==undefined&&input.expires_at!==null&&(!Number.isSafeInteger(input.expires_at)||input.expires_at<=Date.now()))return fail('Invalid expiration',400);
  const bytes=crypto.getRandomValues(new Uint8Array(32));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const raw='ino_'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const row:ApiToken={id:crypto.randomUUID(),user_id:user.id,name:input.name.trim(),prefix:raw.slice(0,12),token_hash:await sha256Hex(raw),scopes:JSON.stringify(scopes),expires_at:input.expires_at??null,last_used_at:null,revoked_at:null,created_at:Date.now()};
  await env.DB.prepare('INSERT INTO api_tokens(id,user_id,name,prefix,token_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(row.id,row.user_id,row.name,row.prefix,row.token_hash,row.scopes,row.expires_at,row.created_at).run();
  return json({token:raw,...metadata(row)},201);
 }
 const match=path.match(/^\/api\/tokens\/([^/]+)$/);
 if(match&&request.method==='DELETE'){
  const result=await env.DB.prepare('UPDATE api_tokens SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(Date.now(),match[1],user.id).run();
  return result.meta.changes?json({ok:true}):fail('Token not found',404);
 }
 return fail('Not found',404);
}
