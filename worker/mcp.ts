import { handleNotes, type NotesEnv } from './notes';
import { verifyApiToken, type TokenEnv } from './tokens';
import type { SessionUser } from './auth';

type McpEnv=TokenEnv&NotesEnv;
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const scopes=(s:string)=>{try{return JSON.parse(s) as string[]}catch{return []}};
async function callNotes(env:McpEnv,user:SessionUser,method:string,path:string,body?:unknown){
 const url=new URL(path,'https://worker.invalid');
 const request=new Request(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const logicalPath=/^\/api\/notes\/[^/]+$/.test(url.pathname)?'/api/notes/:id':url.pathname;
 const result=await handleNotes(request,env,user,logicalPath,url);
 if(!result)throw new Error('Tool operation unavailable');
 const data=await result.json() as any;return {status:result.status,data};
}
async function execute(name:string,args:any,env:McpEnv,user:SessionUser):Promise<unknown>{
 if(name==='search_notes'){
  const q=clean(args?.query,200);const result=await callNotes(env,user,'GET',`/api/notes?q=${encodeURIComponent(q)}&view=${encodeURIComponent(clean(args?.view,20)||'all')}`);
  if(result.status>=400)throw new Error(result.data.error||'Search failed');return result.data.notes;
 }
 if(name==='get_note'){
  const id=clean(args?.id,100);if(!id)throw new Error('id is required');const result=await callNotes(env,user,'GET',`/api/notes/${encodeURIComponent(id)}`);if(result.status>=400)throw new Error(result.data.error);return result.data;
 }
 if(name==='list_folders'||name==='list_tags'){
  const result=await callNotes(env,user,'GET',name==='list_folders'?'/api/folders':'/api/tags');if(result.status>=400)throw new Error(result.data.error);return result.data;
 }
 if(name==='create_note'){
  const title=clean(args?.title,500).replace(/<[^>]*>/g,'').slice(0,500);
  if(typeof args?.body_md!=='string')throw new Error('body_md is required');
  const result=await callNotes(env,user,'POST','/api/notes',{title,body_md:args.body_md.slice(0,200000),folder_id:args.folder_id||null});if(result.status>=400)throw new Error(result.data.error);return result.data;
 }
 if(name==='update_note'){
  const id=clean(args?.id,100);if(!id)throw new Error('id is required');const current=await callNotes(env,user,'GET',`/api/notes/${encodeURIComponent(id)}`);if(current.status>=400)throw new Error(current.data.error);
  const patch:any={revision:current.data.revision};for(const k of ['title','body_md','folder_id','is_pinned','archived_at','reminder_at'])if(args?.[k]!==undefined)patch[k]=args[k];
  if(args?.title!==undefined)patch.title=clean(args.title,500).replace(/<[^>]*>/g,'').slice(0,500);
  if(args?.trashed===true)patch.trashed_at=Date.now();if(args?.trashed===false)patch.trashed_at=null;
  const result=await callNotes(env,user,'PATCH',`/api/notes/${encodeURIComponent(id)}`,patch);if(result.status>=400)throw new Error(result.data.error);return result.data;
 }
 if(name==='create_folder'){
  const folderName=clean(args?.name,100).replace(/<[^>]*>/g,'').slice(0,100);if(!folderName)throw new Error('name is required');
  const result=await callNotes(env,user,'POST','/api/folders',{name:folderName,parent_id:args.parent_id||null});if(result.status>=400)throw new Error(result.data.error);return result.data;
 }
 throw new Error(`Unknown tool: ${name}`);
}
const tools=[
 {name:'search_notes',description:'Search your notes',inputSchema:{type:'object',properties:{query:{type:'string'},view:{type:'string',enum:['all','pinned','archive','trash']}},required:['query']}},
 {name:'get_note',description:'Get a note by id or short code',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}},
 {name:'list_folders',description:'List your folders',inputSchema:{type:'object',properties:{}}},
 {name:'list_tags',description:'List your tags',inputSchema:{type:'object',properties:{}}},
 {name:'create_note',description:'Create an encrypted note',inputSchema:{type:'object',properties:{title:{type:'string'},body_md:{type:'string'},folder_id:{type:'string'}},required:['body_md']}},
 {name:'update_note',description:'Update note fields or move to trash',inputSchema:{type:'object',properties:{id:{type:'string'},title:{type:'string'},body_md:{type:'string'},folder_id:{type:'string'},is_pinned:{type:'boolean'},archived_at:{type:'number'},reminder_at:{type:'number'},trashed:{type:'boolean'}},required:['id']}},
 {name:'create_folder',description:'Create a folder',inputSchema:{type:'object',properties:{name:{type:'string'},parent_id:{type:'string'}},required:['name']}}
];
export async function handleMcp(request:Request,env:McpEnv):Promise<Response>{
 if(request.method==='GET')return response({error:'Method not allowed'},405);
 if(request.method!=='POST')return response({error:'Method not allowed'},405);
 if(request.headers.has('Cookie'))return response({error:'Bearer token required'},401);
 const auth=await verifyApiToken(request,env);if(!auth)return response({error:'Invalid or expired token'},401);
 let rpc:any;try{rpc=await request.json()}catch{return response({error:'Invalid JSON'},400)}
 if(!rpc||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string')return response({jsonrpc:'2.0',id:rpc?.id??null,error:{code:-32600,message:'Invalid Request'}});
 const id=rpc.id??null;
 if(rpc.method==='initialize')return response({jsonrpc:'2.0',id,result:{protocolVersion:rpc.params?.protocolVersion||'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'inotion-notes',version:'1.0.0'}}});
 if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
 if(rpc.method==='tools/list')return response({jsonrpc:'2.0',id,result:{tools}});
 if(rpc.method!=='tools/call')return response({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
 const name=rpc.params?.name,args=rpc.params?.arguments||{};
 const write=['create_note','update_note','create_folder'].includes(name);
 if(write&&!scopes(auth.token.scopes).includes('write'))return response({jsonrpc:'2.0',id,error:{code:-32003,message:'Write scope required'}},403);
 if(!write&&!scopes(auth.token.scopes).includes('read'))return response({jsonrpc:'2.0',id,error:{code:-32003,message:'Read scope required'}},403);
 const now=Date.now(),day=Math.floor(now/86400000)*86400000;
 const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM mcp_audit_log WHERE token_id=? AND created_at>=?').bind(auth.token.id,day).first<{count:number}>();
 if((count?.count||0)>=1000)return response({jsonrpc:'2.0',id,error:{code:-32029,message:'Daily tool call limit exceeded'}},429);
 await env.DB.prepare('INSERT INTO mcp_audit_log(id,token_id,user_id,tool,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),auth.token.id,auth.user.id,name||'unknown',now).run();
 try{return response({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(await execute(name,args,env,auth.user))}]}})}catch(error){return response({jsonrpc:'2.0',id,error:{code:-32602,message:error instanceof Error?error.message:'Tool failed'}})}
}
