import { beforeEach,describe,expect,it,vi } from 'vitest';
import { handleMcp } from './mcp';

const state={token:{id:'token-a',user_id:'user-a',scopes:'["read"]'},user:{id:'user-a',email:'a@test'},count:0,audit:[] as any[],cookie:false};
vi.mock('./tokens',()=>({verifyApiToken:vi.fn(async(request:Request)=>request.headers.get('Authorization')==='Bearer ino_valid'?{token:state.token,user:state.user}:null)}));
const env:any={DB:{prepare(sql:string){let values:any[]=[];const q:any={bind(...args:any[]){values=args;return q},async first(){return sql.includes('COUNT(*)')?{count:state.count}:null},async run(){if(sql.includes('INSERT INTO mcp_audit_log'))state.audit.push(values);return {meta:{changes:1}}},async all(){return {results:[]}}};return q;}}};
const request=(body:any,headers:Record<string,string>={Authorization:'Bearer ino_valid'})=>new Request('https://notes.test/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{state.token={id:'token-a',user_id:'user-a',scopes:'["read"]'};state.count=0;state.audit=[];});

describe('remote MCP endpoint',()=>{
 it('rejects session cookies and invalid bearer tokens',async()=>{
  expect((await handleMcp(request({jsonrpc:'2.0',id:1,method:'tools/list'},{Cookie:'notes_session=abc'}),env)).status).toBe(401);
  expect((await handleMcp(request({jsonrpc:'2.0',id:1,method:'tools/list'},{Authorization:'Bearer invalid'}),env)).status).toBe(401);
 });
 it('requires POST and returns tool catalog through JSON-RPC',async()=>{
  expect((await handleMcp(new Request('https://notes.test/api/mcp'),env)).status).toBe(405);
  const result=await handleMcp(request({jsonrpc:'2.0',id:2,method:'tools/list'}),env);
  expect(result.status).toBe(200);expect((await result.json() as any).result.tools.map((t:any)=>t.name)).toContain('create_note');
 });
 it('enforces write scope and audits each permitted tool call',async()=>{
  const write=await handleMcp(request({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_note',arguments:{title:'x',body_md:'y'}}}),env);
  expect(write.status).toBe(403);expect(state.audit).toHaveLength(0);
  await handleMcp(request({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_folders',arguments:{}}}),env);
  expect(state.audit).toHaveLength(1);expect(state.audit[0][3]).toBe('list_folders');
 });
 it('blocks the 1,001st daily tool call',async()=>{
  state.count=1000;
  const response=await handleMcp(request({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_folders',arguments:{}}}),env);
  expect(response.status).toBe(429);expect(state.audit).toHaveLength(0);
 });
});
